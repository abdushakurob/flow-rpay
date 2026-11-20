import { createHmac, randomBytes } from "node:crypto";
import { env } from "./env.js";
import { ApiError } from "./errors.js";

type BitnobPayout = {
  id?: string;
  quote_id?: string;
  settlement_amount?: string;
  exchange_rate?: { rate?: string; btc_rate?: string };
  fees?: string;
  expires_at?: string;
  address?: string;
  deposit_amount?: string;
  sat_amount?: string;
};

export type BitnobSupportedCountry = {
  code?: string;
  name?: string;
  dial_code?: string;
  corridors?: Array<{ currency?: string; destination_types?: string[] }>;
};

export type BitnobWhoami = {
  environment?: string;
  company?: { name?: string; id?: string };
};

function missingBitnobEnv(): string[] {
  const missing: string[] = [];
  if (!env.bitnobClientId) missing.push("BITNOB_CLIENT_ID");
  if (!env.bitnobClientSecret) missing.push("BITNOB_CLIENT_SECRET");
  return missing;
}

export function bitnobConfigured(): boolean {
  return missingBitnobEnv().length === 0;
}

export function bitnobWebhookConfigured(): boolean {
  return Boolean(env.bitnobWebhookSecret);
}

function assertConfigured() {
  const missing = missingBitnobEnv();
  if (missing.length) {
    throw new ApiError(
      503,
      "payouts_unconfigured",
      `Local withdrawal is not configured. Set ${missing.join(" and ")} (sandbox Client Secret from app.bitnob.com → Settings → API Keys). Base URL stays https://api.bitnob.com; the secret selects sandbox vs production.`,
    );
  }
}

async function bitnob<T>(path: string, body?: unknown, method: "GET" | "POST" = body === undefined ? "GET" : "POST"): Promise<T> {
  assertConfigured();
  const raw = body === undefined ? "" : JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const payload = `${env.bitnobClientId}:${timestamp}:${nonce}:${raw}`;
  const signature = createHmac("sha256", env.bitnobClientSecret).update(payload).digest("hex");
  const response = await fetch(`${env.bitnobBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "X-Auth-Client": env.bitnobClientId,
      "X-Auth-Timestamp": timestamp,
      "X-Auth-Nonce": nonce,
      "X-Auth-Signature": signature,
    },
    body: body === undefined ? undefined : raw,
  });
  const json = (await response.json()) as { data?: T; detail?: string; error?: { message?: string }; message?: string };
  if (!response.ok) {
    throw new ApiError(response.status, "payout_provider_error", json.detail ?? json.error?.message ?? json.message ?? "Payout request failed");
  }
  return (json.data ?? json) as T;
}

/** Safe identity check — returns which Bitnob environment the loaded secret selects. */
export async function bitnobWhoami(): Promise<BitnobWhoami> {
  return bitnob<BitnobWhoami>("/api/whoami");
}

export async function listSupportedCountries(): Promise<BitnobSupportedCountry[]> {
  const data = await bitnob<BitnobSupportedCountry[] | { countries?: BitnobSupportedCountry[] }>("/api/payouts/supported-countries");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.countries)) return data.countries;
  return [];
}

export async function createPayoutQuote(input: {
  reference: string;
  country: string;
  currency: string;
  amountSats: string;
}) {
  const sats = BigInt(input.amountSats);
  const btcAmount = `${sats / 100_000_000n}.${(sats % 100_000_000n).toString().padStart(8, "0")}`;
  const data = await bitnob<{ payout: BitnobPayout }>("/api/payouts/quotes", {
    reference: input.reference,
    country: input.country.toUpperCase(),
    from_asset: "BTC",
    to_currency: input.currency.toUpperCase(),
    source: "onchain",
    chain: "BITCOIN",
    amount: btcAmount,
  });
  const payout = data.payout ?? (data as unknown as BitnobPayout);
  if (!payout.quote_id && !payout.id) {
    throw new ApiError(502, "payout_provider_error", "The payout quote did not include an id");
  }
  return payout;
}

export async function initializePayout(
  quoteId: string,
  input: {
    beneficiary: Record<string, string>;
    reference: string;
    callbackUrl: string;
  },
) {
  const data = await bitnob<{ payout: BitnobPayout }>(`/api/payouts/${quoteId}/initialize`, {
    quote_id: quoteId,
    beneficiary: input.beneficiary,
    reference: input.reference,
    payment_reason: "Flow local currency withdrawal",
    callback_url: input.callbackUrl,
  });
  return data.payout ?? (data as unknown as BitnobPayout);
}

export async function finalizePayout(quoteId: string) {
  const data = await bitnob<{ payout: BitnobPayout }>(`/api/payouts/${encodeURIComponent(quoteId)}/finalize`, undefined, "POST");
  return data.payout ?? (data as unknown as BitnobPayout);
}

/** Bitnob's sandbox accepts a simulated deposit; never call this for production credentials. */
export async function simulateSandboxDeposit(quoteId: string, amountSats: string) {
  return bitnob(`/api/payouts/quotes/${encodeURIComponent(quoteId)}/deposits`, { amount: amountSats });
}
