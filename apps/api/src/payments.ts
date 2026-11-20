import { prisma } from "@flow/db";
import { preimageMatches } from "@flow/contracts";
import { ApiError } from "./errors.js";
import { addInvoice, lookupInvoice } from "./lightning.js";
import { paymentView } from "./serialize.js";
import { notifyPaymentPaid } from "./webhooks-out.js";

export async function createCheckout(businessId: string, input: { amount: string; description: string; reference: string; buyerName?: string; buyerEmail?: string }) {
  const existing = await prisma.order.findUnique({
    where: { businessId_reference: { businessId, reference: input.reference } },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (existing) {
    if (existing.amountSats.toString() !== input.amount) {
      throw new ApiError(409, "reference_conflict", "That reference was already used for a different amount");
    }
    const payment = existing.payments[0];
    if (!payment) throw new ApiError(409, "reference_conflict", "That reference already exists");
    return paymentView(payment);
  }

  const created = await prisma.order.create({
    data: {
      businessId,
      reference: input.reference,
      description: input.description,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      amountSats: BigInt(input.amount),
      status: "pending_payment",
      payments: {
        create: {
          businessId,
          amountSats: BigInt(input.amount),
          status: "created",
        },
      },
    },
    include: { payments: true },
  });
  const payment = created.payments[0];
  if (!payment) throw new ApiError(500, "payment_create_failed", "Payment was not created");

  try {
    const invoice = await addInvoice(input.amount, input.description);
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "awaiting_payment",
        bolt11: invoice.bolt11,
        paymentHash: invoice.paymentHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return paymentView(updated);
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    await prisma.order.update({ where: { id: created.id }, data: { status: "cancelled" } });
    throw error;
  }
}

/** Finish ledger credit if a prior settle marked payment paid then crashed before order/balance. */
async function creditIfOrderStillPending(payment: { id: string; orderId: string; businessId: string; amountSats: bigint }) {
  const credited = await prisma.$transaction(async (tx) => {
    const orderClaim = await tx.order.updateMany({
      where: { id: payment.orderId, status: "pending_payment" },
      data: { status: "paid" },
    });
    if (orderClaim.count !== 1) return false;
    await tx.business.update({
      where: { id: payment.businessId },
      data: { balanceSats: { increment: payment.amountSats } },
    });
    return true;
  });
  return credited;
}

export async function settleFromNode(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.paymentHash) return payment;

  // Already paid: heal paid-without-credit (order still pending_payment), then return.
  if (payment.status === "paid") {
    await creditIfOrderStillPending(payment);
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  if (payment.status !== "awaiting_payment") return payment;
  if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "expired" } });
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }
  const invoice = await lookupInvoice(payment.paymentHash);
  const settled = invoice.settled === true || invoice.state === "SETTLED";
  if (!settled) return payment;
  // LND / NWC (with preimage): require preimage ↔ payment hash.
  // CoinOS / OpenNode / NWC (settled, no preimage): trust provider lookup — never invent success.
  if (invoice.custodialSettled) {
    // ok — provider confirmed paid via lookup
  } else if (!invoice.r_preimage || !preimageMatches(invoice.r_preimage, payment.paymentHash)) {
    return payment;
  }

  // Claim + order paid + balance credit must be atomic — otherwise checkout can show
  // "paid" while balanceSats stays 0 (concurrent poll or crash between claim and credit).
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, status: "awaiting_payment" },
      data: { status: "paid", preimage: invoice.r_preimage ?? null, paidAt: new Date() },
    });
    if (claim.count !== 1) return false;
    await tx.order.update({ where: { id: payment.orderId }, data: { status: "paid" } });
    await tx.business.update({
      where: { id: payment.businessId },
      data: { balanceSats: { increment: payment.amountSats } },
    });
    return true;
  });

  if (!claimed) {
    // Lost the race — peer may have claimed; heal if peer crashed mid-settle.
    const latest = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (latest?.status === "paid") await creditIfOrderStillPending(latest);
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  try {
    await notifyPaymentPaid(payment.id);
  } catch {
    // Outbound webhooks are best-effort for MVP; settlement already committed.
  }
  return prisma.payment.findUnique({ where: { id: payment.id } });
}

export async function pollOpenPayments() {
  const open = await prisma.payment.findMany({ where: { status: "awaiting_payment" }, take: 50 });
  for (const payment of open) {
    try {
      await settleFromNode(payment.id);
    } catch {
      // The node will be asked again on the next poll. A failed lookup does not mark the sale paid.
    }
  }
}
