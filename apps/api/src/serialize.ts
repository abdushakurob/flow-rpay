import type { Payment, Withdrawal } from "@flow/db";
import { configuredLightningNetwork } from "./network.js";

export function sats(value: bigint): string {
  return value.toString();
}

export function paymentView(payment: Payment, businessName?: string, buyer?: { description: string; buyerName: string | null; buyerEmail: string | null }) {
  return {
    id: payment.id,
    amount: sats(payment.amountSats),
    currency: "BTC",
    status: payment.status,
    invoice: payment.bolt11,
    paymentHash: payment.paymentHash,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/pay/${payment.id}`,
    businessName,
    ...(buyer ? { description: buyer.description, buyerName: buyer.buyerName, buyerEmail: buyer.buyerEmail } : {}),
    network: configuredLightningNetwork(),
  };
}

export function withdrawalView(withdrawal: Withdrawal) {
  return {
    id: withdrawal.id,
    kind: withdrawal.kind,
    amount: sats(withdrawal.amountSats),
    status: withdrawal.status,
    destination: withdrawal.destination,
    country: withdrawal.country,
    currency: withdrawal.currency,
    localAmount: withdrawal.localAmount,
    rate: withdrawal.rate,
    fees: withdrawal.fees,
    quoteId: withdrawal.providerQuote,
    createdAt: withdrawal.createdAt.toISOString(),
    network: configuredLightningNetwork(),
  };
}
