import { env } from "./env.js";
import { ApiError } from "./errors.js";

type OpenNodeEnvelope<T> = { data?: T; success?: boolean; message?: string };

type ChargeData = {
  id: string;
  status?: string;
  amount?: number;
  price?: number;
  lightning_invoice?: { payreq?: string; expires_at?: number };
  lightning?: { payreq?: string; status?: string };
};

type WithdrawalData = {
  id: string;
  status?: string;
  type?: string;
  amount?: number;
  fee?: number;
  error?: string;
  reference?: string;
};

type BalanceData = {
  balance?: { BTC?: number; balance?: number };
  // Some responses nest differently; we only need a successful auth round-trip.
};

function baseUrl(): string {
  return env.opennodeApiUrl.replace(/\/$/, "");
}

function isDevHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "dev-api.opennode.com" || host.endsWith(".dev.opennode.com");
  } catch {
    return false;
  }
}

async function opennode<T>(
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  if (!env.opennodeApiKey) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "OpenNode is not configured. Set OPENNODE_API_KEY (dev key from https://dev.opennode.com/)",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: env.opennodeApiKey,
        "content-type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(503, "lightning_unavailable", "OpenNode did not respond in time");
    }
    throw error;
  }
  const text = await response.text();
  const json = (text ? JSON.parse(text) : {}) as OpenNodeEnvelope<T> & { message?: string };
  if (!response.ok) {
    const message = json.message ?? "OpenNode request failed";
    throw new ApiError(502, "lightning_error", message);
  }
  if (json.data === undefined) {
    throw new ApiError(502, "lightning_error", "OpenNode returned an empty response");
  }
  return json.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWithdrawalConfirmed(id: string): Promise<WithdrawalData> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const withdrawal = await opennode<WithdrawalData>(`/v1/withdrawal/${id}`, { timeoutMs: 15_000 });
    const status = (withdrawal.status ?? "").toLowerCase();
    if (status === "confirmed") return withdrawal;
    if (status === "error" || status === "failed") {
      throw new ApiError(502, "lightning_error", withdrawal.error ?? "OpenNode withdrawal failed");
    }
    await sleep(1_000);
  }
  throw new ApiError(503, "lightning_unavailable", "OpenNode withdrawal stayed pending too long");
}

export async function assertOpenNodeTestnet(): Promise<void> {
  if (!isDevHost(baseUrl())) {
    throw new ApiError(
      500,
      "wrong_network",
      "Flow only runs on OpenNode development (testnet). Set OPENNODE_API_URL=https://dev-api.opennode.com",
    );
  }
  await opennode<BalanceData>("/v1/account/balance", { timeoutMs: 20_000 });
}

export async function assertOpenNodeReady(): Promise<void> {
  await assertOpenNodeTestnet();
}

export async function addOpenNodeInvoice(amountSats: string, memo: string) {
  await assertOpenNodeReady();
  const charge = await opennode<ChargeData>("/v1/charges", {
    method: "POST",
    body: {
      amount: Number(amountSats),
      description: memo.slice(0, 200) || "Flow checkout",
      // OpenNode TTL is minutes; Flow checkout expires in 60 minutes.
      ttl: 60,
      auto_settle: false,
    },
    timeoutMs: 30_000,
  });
  const bolt11 = charge.lightning_invoice?.payreq ?? charge.lightning?.payreq;
  if (!bolt11 || !charge.id) {
    throw new ApiError(502, "lightning_error", "OpenNode did not return a Lightning invoice");
  }
  // OpenNode does not expose payment preimages; settle by charge id + status=paid.
  return { bolt11, paymentHash: charge.id };
}

export async function lookupOpenNodeInvoice(chargeId: string) {
  const charge = await opennode<ChargeData>(`/v2/charge/${encodeURIComponent(chargeId)}`);
  const status = (charge.status ?? "").toLowerCase();
  const paid = status === "paid";
  return {
    settled: paid,
    state: paid ? "SETTLED" : status.toUpperCase() || "OPEN",
    custodialSettled: paid,
    value: String(charge.amount ?? charge.price ?? ""),
  };
}

export async function payOpenNodeInvoice(bolt11: string) {
  await assertOpenNodeReady();
  const created = await opennode<WithdrawalData>("/v2/withdrawals", {
    method: "POST",
    body: { type: "ln", address: bolt11 },
    timeoutMs: 30_000,
  });
  if (!created.id) {
    throw new ApiError(502, "lightning_error", "OpenNode did not start the Lightning withdrawal");
  }
  await waitWithdrawalConfirmed(created.id);
  return { payment_preimage: undefined as string | undefined, payment_error: undefined as string | undefined };
}

export async function sendOpenNodeCoins(address: string, amountSats: string) {
  await assertOpenNodeReady();
  const created = await opennode<WithdrawalData>("/v2/withdrawals", {
    method: "POST",
    body: { type: "chain", address, amount: Number(amountSats) },
    timeoutMs: 60_000,
  });
  if (!created.id) {
    throw new ApiError(502, "lightning_error", "OpenNode did not start the on-chain withdrawal");
  }
  await waitWithdrawalConfirmed(created.id);
  // OpenNode does not always return a txid on the withdrawal object; id is enough for Flow's completion check.
  return { txid: created.id };
}
