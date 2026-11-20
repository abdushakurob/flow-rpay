/**
 * Nostr Wallet Connect (NIP-47) via @getalby/sdk.
 * Preferred Lightning backend when NWC_CONNECTION_STRING is set (hackathon faucet / Alby Hub).
 */
import { NWCClient, Nip47Error } from "@getalby/sdk";
import { env } from "./env.js";
import { ApiError } from "./errors.js";
import type { LightningNetwork } from "./network.js";

let cached: { url: string; client: NWCClient } | null = null;

function connectionString(): string {
  const url = env.nwcConnectionString;
  if (!url) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "NWC is not configured. Set NWC_CONNECTION_STRING (see README — Alby NWC faucet)",
    );
  }
  if (!url.startsWith("nostr+walletconnect://")) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "NWC_CONNECTION_STRING must start with nostr+walletconnect://",
    );
  }
  return url;
}

function getClient(): NWCClient {
  const url = connectionString();
  if (cached && cached.url === url) return cached.client;
  if (cached) {
    try {
      cached.client.close();
    } catch {
      // ignore close errors when rotating credentials
    }
  }
  const client = new NWCClient({ nostrWalletConnectUrl: url });
  cached = { url, client };
  return client;
}

function mapNwcError(error: unknown, fallback: string): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Nip47Error) {
    throw new ApiError(502, "lightning_error", error.message || fallback);
  }
  if (error instanceof Error) {
    throw new ApiError(502, "lightning_error", error.message || fallback);
  }
  throw new ApiError(502, "lightning_error", fallback);
}

function mapNetwork(raw: string | undefined): LightningNetwork {
  const n = (raw ?? "").toLowerCase();
  if (n === "regtest" || n === "testnet" || n === "mainnet") return n;
  // Faucet / sandbox wallets often report mainnet-like labels while payments are isolated.
  return "testnet";
}

export async function assertNwcReady(): Promise<{
  alias?: string;
  network: LightningNetwork;
  balanceSats: number;
  methods?: string[];
}> {
  const client = getClient();
  try {
    const [info, balance] = await Promise.all([client.getInfo(), client.getBalance()]);
    const network = mapNetwork(info.network);
    const balanceSats = Math.floor(Number(balance.balance ?? 0) / 1000);
    return {
      alias: info.alias,
      network,
      balanceSats,
      methods: info.methods,
    };
  } catch (error) {
    mapNwcError(error, "NWC wallet did not respond");
  }
}

export async function addNwcInvoice(amountSats: string, memo: string) {
  await assertNwcReady();
  const amount = Number(amountSats);
  if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) {
    throw new ApiError(400, "invalid_amount", "NWC invoice amount must be a positive integer (sats)");
  }
  const client = getClient();
  try {
    const tx = await client.makeInvoice({
      amount: amount * 1000, // NIP-47 uses millisats
      description: memo.slice(0, 200) || "Flow checkout",
      expiry: 3600,
    });
    const bolt11 = tx.invoice;
    const paymentHash = tx.payment_hash;
    if (!bolt11 || !paymentHash) {
      throw new ApiError(502, "lightning_error", "NWC did not return a Lightning invoice");
    }
    return { bolt11, paymentHash };
  } catch (error) {
    mapNwcError(error, "NWC make_invoice failed");
  }
}

/** Convert NWC hex preimage to LND-style base64 for preimageMatches(). */
function preimageHexToBase64(preimageHex: string | undefined): string | undefined {
  if (!preimageHex?.trim()) return undefined;
  const hex = preimageHex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) return undefined;
  try {
    return Buffer.from(hex, "hex").toString("base64");
  } catch {
    return undefined;
  }
}

export async function lookupNwcInvoice(paymentHash: string) {
  const client = getClient();
  try {
    const tx = await client.lookupInvoice({ payment_hash: paymentHash });
    const paid = tx.state === "settled";
    const r_preimage = preimageHexToBase64(tx.preimage);
    return {
      settled: paid,
      state: paid ? "SETTLED" : "OPEN",
      // Prefer cryptographic settle when preimage is present; otherwise trust NWC settled state.
      custodialSettled: paid && !r_preimage,
      r_preimage,
      r_hash: tx.payment_hash,
      payment_request: tx.invoice,
      value: String(Math.floor(Number(tx.amount ?? 0) / 1000) || ""),
      expiry: tx.expires_at ? String(tx.expires_at) : undefined,
      creation_date: tx.created_at ? String(tx.created_at) : undefined,
    };
  } catch (error) {
    mapNwcError(error, "NWC lookup_invoice failed");
  }
}

export async function payNwcInvoice(bolt11: string) {
  await assertNwcReady();
  const client = getClient();
  try {
    const paid = await client.payInvoice({ invoice: bolt11 });
    const preimageB64 = preimageHexToBase64(paid.preimage);
    return {
      payment_preimage: preimageB64,
      payment_error: undefined as string | undefined,
    };
  } catch (error) {
    if (error instanceof Nip47Error) {
      return { payment_error: error.message, payment_preimage: undefined as string | undefined };
    }
    mapNwcError(error, "NWC pay_invoice failed");
  }
}

export async function sendNwcCoins(_address: string, _amountSats: string): Promise<{ txid: string }> {
  throw new ApiError(
    501,
    "unsupported",
    "On-chain withdraw is not available via NWC. Pay a Lightning invoice instead, or use Bitnob for local currency.",
  );
}
