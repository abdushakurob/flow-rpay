import { readFileSync } from "node:fs";
import { Agent, fetch as undiciFetch } from "undici";
import { env, lndConfigured } from "./env.js";
import { ApiError } from "./errors.js";
import { lightningNetworkFromEnv, type LightningNetwork } from "./network.js";

type InvoiceResponse = {
  r_hash?: string;
  payment_request?: string;
  settled?: boolean;
  state?: string;
  r_preimage?: string;
  creation_date?: string;
  expiry?: string;
  value?: string;
};

type GetInfoResponse = {
  testnet?: boolean;
  synced_to_chain?: boolean;
  block_height?: number;
  chains?: { network?: string; chain?: string }[];
};

let dispatcher: Agent | null = null;
let dispatcherKey = "";

function macaroonHex(): string {
  if (env.lndMacaroonHex) {
    const hex = env.lndMacaroonHex.replace(/\s+/g, "");
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      throw new ApiError(503, "lightning_unconfigured", "LND_MACAROON must be hex-encoded");
    }
    return hex.toLowerCase();
  }
  if (env.lndMacaroonPath) {
    return readFileSync(env.lndMacaroonPath).toString("hex");
  }
  throw new ApiError(503, "lightning_unconfigured", "Set LND_MACAROON or LND_MACAROON_PATH for the LND node");
}

function tlsCert(): Buffer | null {
  if (env.lndTlsCertPem) return Buffer.from(env.lndTlsCertPem, "utf8");
  if (env.lndTlsCertPath) return readFileSync(env.lndTlsCertPath);
  return null;
}

function client(): { dispatcher: Agent; macaroon: string } {
  if (!lndConfigured()) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "Hosted Lightning is not configured. Set LND_REST_URL and LND_MACAROON (or LND_MACAROON_PATH)",
    );
  }
  const macaroon = macaroonHex();
  const cert = tlsCert();
  const key = `${env.lndRestUrl}|${env.lndTlsSkipVerify}|${cert?.toString("hex") ?? "default"}`;
  if (!dispatcher || dispatcherKey !== key) {
    void dispatcher?.close();
    if (env.lndTlsSkipVerify) {
      dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    } else if (cert) {
      dispatcher = new Agent({ connect: { ca: cert } });
    } else {
      // Public CA (e.g. some hosted endpoints). Prefer LND_TLS_CERT_PATH when the host issues a node cert.
      dispatcher = new Agent();
    }
    dispatcherKey = key;
  }
  return { dispatcher, macaroon };
}

async function lnd<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  let auth: { dispatcher: Agent; macaroon: string };
  try {
    auth = client();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "lightning_unconfigured", "Hosted Lightning credentials could not be loaded");
  }
  let response: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    response = await undiciFetch(`${env.lndRestUrl}${path}`, {
      method: init?.method ?? "GET",
      dispatcher: auth.dispatcher,
      headers: {
        "Grpc-Metadata-macaroon": auth.macaroon,
        "content-type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(503, "lightning_unavailable", "The hosted Lightning node did not respond in time");
    }
    throw error;
  }
  const text = await response.text();
  const json = text ? (JSON.parse(text) as T & { message?: string; error?: string }) : ({} as T);
  if (!response.ok) {
    const message = (json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? "Lightning request failed";
    throw new ApiError(502, "lightning_error", message);
  }
  return json;
}

/** Resolve LND chain network; allow testnet* always, regtest when detected or LIGHTNING_NETWORK=regtest. */
export function resolveLndNetwork(info: GetInfoResponse): LightningNetwork {
  const chainNetwork = info.chains?.[0]?.network?.toLowerCase() ?? "";
  const hint = lightningNetworkFromEnv();

  if (chainNetwork === "regtest" || chainNetwork === "simnet") return "regtest";
  if (
    info.testnet === true ||
    chainNetwork === "testnet" ||
    chainNetwork === "testnet3" ||
    chainNetwork === "testnet4"
  ) {
    return "testnet";
  }
  if (chainNetwork === "mainnet" || chainNetwork === "main") return "mainnet";

  // getinfo omitted chain details — honor explicit env
  if (hint === "regtest") return "regtest";
  if (hint === "testnet") return "testnet";
  if (hint === "mainnet") return "mainnet";

  throw new ApiError(500, "wrong_network", "Could not determine LND network from getinfo");
}

function assertAllowedNetwork(info: GetInfoResponse): LightningNetwork {
  const resolved = resolveLndNetwork(info);
  const hint = lightningNetworkFromEnv();

  if (resolved === "testnet") return resolved;

  if (resolved === "regtest") {
    if (hint && hint !== "regtest") {
      throw new ApiError(
        500,
        "wrong_network",
        `LND is on regtest but LIGHTNING_NETWORK=${hint}. Set LIGHTNING_NETWORK=regtest`,
      );
    }
    return resolved;
  }

  // Reject accidental mainnet LND unless explicitly opted in
  if (resolved === "mainnet" && hint === "mainnet") return resolved;

  throw new ApiError(
    500,
    "wrong_network",
    "Flow LND path allows testnet, or regtest when LIGHTNING_NETWORK=regtest (or getinfo reports regtest)",
  );
}

export async function assertTestnet(): Promise<void> {
  if (!lndConfigured()) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "Lightning is not configured. Set LND_REST_URL and LND_MACAROON (or LND_MACAROON_PATH)",
    );
  }
  const info = await lnd<GetInfoResponse>("/v1/getinfo", { timeoutMs: 20_000 });
  assertAllowedNetwork(info);
}

export async function assertLightningReady(): Promise<GetInfoResponse & { flowNetwork: LightningNetwork }> {
  if (!lndConfigured()) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "Lightning is not configured. Set LND_REST_URL and LND_MACAROON (or LND_MACAROON_PATH)",
    );
  }
  const info = await lnd<GetInfoResponse>("/v1/getinfo", { timeoutMs: 20_000 });
  const flowNetwork = assertAllowedNetwork(info);
  if (!info.synced_to_chain) {
    throw new ApiError(
      503,
      "lightning_unavailable",
      `The Lightning node is not ready yet (height ${info.block_height ?? 0})`,
    );
  }
  return { ...info, flowNetwork };
}

export async function addInvoice(amountSats: string, memo: string) {
  await assertLightningReady();
  const invoice = await lnd<InvoiceResponse>("/v1/invoices", {
    method: "POST",
    body: { value: amountSats, memo, expiry: "3600" },
    timeoutMs: 30_000,
  });
  if (!invoice.payment_request || !invoice.r_hash) {
    throw new ApiError(502, "lightning_error", "The node did not return an invoice");
  }
  const paymentHash = Buffer.from(invoice.r_hash, "base64").toString("hex");
  return { bolt11: invoice.payment_request, paymentHash };
}

export async function lookupInvoice(paymentHashHex: string): Promise<InvoiceResponse> {
  const encoded = encodeURIComponent(Buffer.from(paymentHashHex, "hex").toString("base64"));
  return lnd<InvoiceResponse>(`/v1/invoice/${encoded}`);
}

export async function payInvoice(bolt11: string) {
  await assertLightningReady();
  return lnd<{ payment_error?: string; payment_preimage?: string }>("/v1/channels/transactions", {
    method: "POST",
    body: { payment_request: bolt11, timeout_seconds: 40 },
    timeoutMs: 50_000,
  });
}

export async function sendCoins(address: string, amountSats: string) {
  await assertLightningReady();
  return lnd<{ txid?: string }>("/v1/transactions", {
    method: "POST",
    body: { addr: address, amount: amountSats, sat_per_vbyte: "2" },
    timeoutMs: 60_000,
  });
}
