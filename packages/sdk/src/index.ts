import { createHmac, timingSafeEqual } from "node:crypto";

export type FlowCheckout = {
  id: string;
  url: string;
  invoice: string | null;
  paymentHash: string | null;
  amount: string;
  status: string;
  expiresAt: string | null;
  network: "regtest" | "testnet" | "mainnet";
  description?: string;
  buyerName?: string | null;
  buyerEmail?: string | null;
};

export type FlowWithdrawal = {
  id: string;
  kind: "bitcoin" | "local";
  amount: string;
  status: string;
  localAmount: string | null;
  currency: string | null;
  rate: string | null;
  fees: string | null;
  network: "regtest" | "testnet" | "mainnet";
};

export type FlowPaymentLink = {
  id: string;
  slug: string;
  url: string;
  status: string;
  productId?: string;
};

type FlowOptions = { apiKey: string; baseUrl?: string };

/** Verify a Flow outbound webhook. HMAC-SHA512 hex over the raw body; header is x-flow-signature. */
export function verifyWebhook(rawBody: string | Buffer, signature: string, secret: string): boolean {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha512", secret).update(body).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class Flow {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: FlowOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "http://localhost:4000";
  }

  checkouts = {
    create: (input: { amount: string; description: string; reference: string }, idempotencyKey = input.reference) =>
      this.request<FlowCheckout>("/v1/checkouts", input, idempotencyKey),
    retrieve: (id: string) => this.request<FlowCheckout>(`/v1/checkouts/${id}`),
  };

  payments = {
    create: (input: { amount: string; description: string; reference: string }, idempotencyKey = input.reference) =>
      this.request<FlowCheckout>("/v1/payments", input, idempotencyKey),
    retrieve: (id: string) => this.request<FlowCheckout>(`/v1/payments/${id}`),
  };

  paymentLinks = {
    create: (input: { productId: string }, idempotencyKey: string) =>
      this.request<FlowPaymentLink>("/v1/payment-links", input, idempotencyKey),
    retrieve: (id: string) => this.request<FlowPaymentLink>(`/v1/payment-links/${id}`),
    list: () => this.request<FlowPaymentLink[]>("/v1/payment-links"),
  };

  /** Local withdrawals call Flow’s server-side payout path; pass only your Flow API key. */
  withdrawals = {
    bitcoin: {
      create: (input: { amount: string; address?: string; invoice?: string }, idempotencyKey: string) =>
        this.request<FlowWithdrawal>("/v1/withdrawals/bitcoin", input, idempotencyKey),
    },
    local: {
      quote: (input: { amount: string; country: string; currency: string }, idempotencyKey: string) =>
        this.request<FlowWithdrawal>("/v1/withdrawals/local/quote", input, idempotencyKey),
      create: (
        input: {
          quoteId: string;
          amount: string;
          country: string;
          currency: string;
          beneficiary: {
            destinationType: "bank" | "mobile_money";
            accountName: string;
            accountNumber: string;
            bankCode?: string;
            network?: string;
          };
        },
        idempotencyKey: string,
      ) => this.request<FlowWithdrawal>("/v1/withdrawals/local", input, idempotencyKey),
    },
    retrieve: (id: string) => this.request<FlowWithdrawal>(`/v1/withdrawals/${id}`),
  };

  webhooks = {
    verify: verifyWebhook,
  };

  transactions = {
    list: () => this.request<FlowCheckout[]>("/v1/transactions"),
  };

  private async request<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(json.error?.message ?? "Flow request failed");
    }
    return json;
  }
}
