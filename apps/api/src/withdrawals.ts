import { prisma } from "@flow/db";
import { ApiError } from "./errors.js";
import { env } from "./env.js";
import { payInvoice, sendCoins } from "./lightning.js";
import { bitnobWebhookConfigured, bitnobWhoami, createPayoutQuote, finalizePayout, initializePayout, simulateSandboxDeposit } from "./bitnob.js";
import { randomToken } from "./crypto.js";
import { withdrawalView } from "./serialize.js";

async function reserve(businessId: string, amount: bigint) {
  const updated = await prisma.$executeRaw`
    UPDATE "Business"
    SET "reservedSats" = "reservedSats" + ${amount}
    WHERE id = ${businessId} AND "balanceSats" - "reservedSats" >= ${amount}
  `;
  if (updated !== 1) {
    throw new ApiError(422, "insufficient_balance", "That amount is above the available balance");
  }
}

async function release(businessId: string, amount: bigint) {
  await prisma.business.update({
    where: { id: businessId },
    data: { reservedSats: { decrement: amount } },
  });
}

async function capture(businessId: string, amount: bigint) {
  await prisma.business.update({
    where: { id: businessId },
    data: {
      balanceSats: { decrement: amount },
      reservedSats: { decrement: amount },
    },
  });
}

export async function withdrawBitcoin(businessId: string, input: { amount: string; address?: string; invoice?: string }) {
  const amount = BigInt(input.amount);
  const destination = input.invoice ?? input.address;
  if (!destination) throw new ApiError(400, "invalid_destination", "Provide a Bitcoin address or a Lightning invoice");
  await reserve(businessId, amount);
  const withdrawal = await prisma.withdrawal.create({
    data: {
      businessId,
      kind: "bitcoin",
      amountSats: amount,
      status: "pending",
      destination,
    },
  });
  let sent = false;
  try {
    if (input.invoice) {
      const paid = await payInvoice(input.invoice);
      if (paid.payment_error) throw new ApiError(502, "lightning_error", paid.payment_error);
    } else if (input.address) {
      const broadcast = await sendCoins(input.address, input.amount);
      if (!broadcast.txid) throw new ApiError(502, "lightning_error", "The node did not broadcast the transaction");
    }
    sent = true;
    await capture(businessId, amount);
    const completed = await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "completed" },
    });
    return withdrawalView(completed);
  } catch (error) {
    if (!sent) await release(businessId, amount);
    await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "failed" } });
    throw error;
  }
}

export async function quoteLocal(businessId: string, input: { amount: string; country: string; currency: string }) {
  const identity = await bitnobWhoami();
  if (identity.environment !== "sandbox") throw new ApiError(503, "sandbox_required", "Local withdrawals are enabled for Bitnob sandbox credentials only");
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new ApiError(404, "not_found", "Business not found");
  if (business.country.toUpperCase() !== input.country.toUpperCase()) {
    throw new ApiError(422, "country_mismatch", "Choose a currency for the business country");
  }
  const available = business.balanceSats - business.reservedSats;
  if (available < BigInt(input.amount)) {
    throw new ApiError(422, "insufficient_balance", "That amount is above the available balance");
  }
  const reference = `flow_${randomToken(9)}`;
  const quote = await createPayoutQuote({
    reference,
    country: input.country,
    currency: input.currency,
    amountSats: input.amount,
  });
  const quoteId = quote.quote_id ?? quote.id;
  if (!quoteId) throw new ApiError(502, "payout_provider_error", "The payout quote did not include an id");
  const withdrawal = await prisma.withdrawal.create({
    data: {
      businessId,
      kind: "local",
      amountSats: BigInt(input.amount),
      status: "quoted",
      // Hold Bitnob reference until confirm overwrites with the beneficiary label.
      destination: reference,
      country: input.country.toUpperCase(),
      currency: input.currency.toUpperCase(),
      localAmount: quote.settlement_amount ?? null,
      rate: quote.exchange_rate?.rate ?? quote.exchange_rate?.btc_rate ?? null,
      fees: quote.fees ?? null,
      providerQuote: quoteId,
    },
  });
  return withdrawalView(withdrawal);
}

export async function confirmLocal(
  businessId: string,
  input: {
    quoteId: string;
    amount: string;
    beneficiary: {
      destinationType: "bank" | "mobile_money";
      accountName: string;
      accountNumber: string;
      bankCode?: string;
      network?: string;
    };
  },
) {
  const withdrawal = await prisma.withdrawal.findFirst({
    where: { businessId, providerQuote: input.quoteId, kind: "local", status: "quoted" },
  });
  if (!withdrawal) throw new ApiError(404, "quote_not_found", "That quote is not open");
  if (withdrawal.amountSats.toString() !== input.amount) {
    throw new ApiError(409, "amount_mismatch", "The amount does not match the quote");
  }
  if (input.beneficiary.destinationType === "bank" && !input.beneficiary.bankCode) {
    throw new ApiError(422, "bank_code_required", "A bank code is required for a bank withdrawal");
  }
  if (input.beneficiary.destinationType === "mobile_money" && !input.beneficiary.network) {
    throw new ApiError(422, "network_required", "A mobile-money network is required");
  }
  const reference = withdrawal.destination.startsWith("flow_") ? withdrawal.destination : `flow_${randomToken(9)}`;
  if (!bitnobWebhookConfigured()) throw new ApiError(503, "webhook_unconfigured", "Configure the Bitnob webhook signing secret before confirming a payout");
  const identity = await bitnobWhoami();
  if (identity.environment !== "sandbox") throw new ApiError(503, "sandbox_required", "Local withdrawals are enabled for Bitnob sandbox credentials only");
  const callbackUrl = `${env.apiUrl.replace(/\/$/, "")}/webhooks/bitnob`;
  if (!callbackUrl.startsWith("https://")) throw new ApiError(503, "webhook_unreachable", "Set API_URL to the public HTTPS API origin before confirming a payout");
  await reserve(businessId, withdrawal.amountSats);
  let sent = false;
  try {
    const payout = await initializePayout(input.quoteId, {
      beneficiary: {
        destination_type: input.beneficiary.destinationType,
        account_name: input.beneficiary.accountName,
        account_number: input.beneficiary.accountNumber,
        bank_code: input.beneficiary.bankCode ?? "",
        network: input.beneficiary.network ?? "",
        country: withdrawal.country ?? "",
      },
      reference,
      callbackUrl,
    });
    // Sandbox funding is simulated by Bitnob. NWC faucet sats cannot be sent
    // to Bitnob, and production payouts are blocked above.
    const finalized = await finalizePayout(input.quoteId);
    await simulateSandboxDeposit(input.quoteId, finalized.sat_amount ?? withdrawal.amountSats.toString());
    sent = true;
    await capture(businessId, withdrawal.amountSats);
    const updated = await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "processing",
        destination: `${input.beneficiary.accountName} ${input.beneficiary.accountNumber}`,
        fundingTarget: "Bitnob sandbox simulated deposit",
        providerPayout: finalized.id ?? payout.id ?? null,
      },
    });
    return withdrawalView(updated);
  } catch (error) {
    if (!sent) await release(businessId, withdrawal.amountSats);
    await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "failed" } });
    throw error;
  }
}
