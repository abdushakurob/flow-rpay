import { env } from "./env.js";
import { ApiError } from "./errors.js";

type CoinosMe = {
  id?: string;
  username?: string;
  balance?: number;
};

type CoinosInvoice = {
  id?: string;
  text?: string;
  paymentHash?: string;
  amount?: number;
  received?: number;
  pending?: number;
  currency?: string;
  type?: string;
  hash?: string;
};

type CoinosPayment = {
  id?: string;
  amount?: number;
  fee?: number;
  preimage?: string;
  payment_preimage?: string;
  hash?: string;
  error?: string;
};

type CoinosBitcoinSend = {
  txid?: string;
  id?: string;
  hash?: string;
};

function baseUrl(): string {
  return env.coinosApiUrl.replace(/\/$/, "");
}

async function coinos<T>(
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  if (!env.coinosToken) {
    throw new ApiError(
      503,
      "lightning_unconfigured",
      "CoinOS is not configured. Set COINOS_TOKEN (instant signup — see README)",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.coinosToken}`,
        "content-type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(503, "lightning_unavailable", "CoinOS did not respond in time");
    }
    throw error;
  }
  const text = await response.text();
  let json: T | { message?: string; error?: string } = {};
  try {
    json = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    if (!response.ok) {
      throw new ApiError(502, "lightning_error", text.slice(0, 200) || "CoinOS request failed");
    }
    throw new ApiError(502, "lightning_error", "CoinOS returned non-JSON");
  }
  if (!response.ok) {
    const message =
      (json as { message?: string; error?: string }).message ??
      (json as { error?: string }).error ??
      text.slice(0, 200) ??
      "CoinOS request failed";
    throw new ApiError(502, "lightning_error", message);
  }
  return json as T;
}

export async function assertCoinosReady(): Promise<CoinosMe> {
  const me = await coinos<CoinosMe>("/me", { timeoutMs: 20_000 });
  if (!me.id && !me.username) {
    throw new ApiError(502, "lightning_error", "CoinOS /me returned an unexpected payload");
  }
  return me;
}

export async function addCoinosInvoice(amountSats: string, memo: string) {
  await assertCoinosReady();
  const amount = Number(amountSats);
  if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) {
    throw new ApiError(400, "invalid_amount", "CoinOS invoice amount must be a positive integer (sats)");
  }
  const invoice = await coinos<CoinosInvoice>("/invoice", {
    method: "POST",
    body: {
      invoice: {
        amount,
        type: "lightning",
        currency: "SAT",
        memo: memo.slice(0, 200) || "Flow checkout",
      },
    },
    timeoutMs: 30_000,
  });
  const bolt11 = invoice.text;
  // Lookup must use CoinOS invoice id (paymentHash path 404s). Same pattern as OpenNode charge id.
  const lookupId = invoice.id;
  if (!bolt11 || !lookupId) {
    throw new ApiError(502, "lightning_error", "CoinOS did not return a Lightning invoice");
  }
  return { bolt11, paymentHash: lookupId };
}

export async function lookupCoinosInvoice(invoiceId: string) {
  const invoice = await coinos<CoinosInvoice>(`/invoice/${encodeURIComponent(invoiceId)}`);
  const amount = Number(invoice.amount ?? 0);
  const received = Number(invoice.received ?? 0);
  const paid = amount > 0 && received >= amount;
  return {
    settled: paid,
    state: paid ? "SETTLED" : "OPEN",
    custodialSettled: paid,
    value: String(amount || ""),
    r_hash: invoice.paymentHash,
  };
}

export async function payCoinosInvoice(bolt11: string) {
  await assertCoinosReady();
  const paid = await coinos<CoinosPayment>("/payments", {
    method: "POST",
    body: { payreq: bolt11 },
    timeoutMs: 50_000,
  });
  if (paid.error) {
    return { payment_error: paid.error, payment_preimage: undefined as string | undefined };
  }
  const preimage = paid.preimage ?? paid.payment_preimage;
  return { payment_preimage: preimage, payment_error: undefined as string | undefined };
}

export async function sendCoinosCoins(address: string, amountSats: string) {
  await assertCoinosReady();
  const amount = Number(amountSats);
  if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) {
    throw new ApiError(400, "invalid_amount", "CoinOS on-chain amount must be a positive integer (sats)");
  }
  const sent = await coinos<CoinosBitcoinSend>("/bitcoin/send", {
    method: "POST",
    body: { address, amount },
    timeoutMs: 60_000,
  });
  const txid = sent.txid ?? sent.hash ?? sent.id;
  if (!txid) {
    throw new ApiError(502, "lightning_error", "CoinOS did not return a transaction id");
  }
  return { txid };
}
