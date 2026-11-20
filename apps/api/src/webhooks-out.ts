import { signHmacSha512 } from "@flow/contracts";
import { prisma } from "@flow/db";
import { decrypt } from "./crypto.js";
import { paymentView } from "./serialize.js";

/** Best-effort delivery when a payment becomes paid. Failures are logged by the caller, not retried here. */
export async function notifyPaymentPaid(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { business: true, order: true } });
  if (!payment || payment.status !== "paid") return;

  const endpoints = await prisma.webhookEndpoint.findMany({ where: { businessId: payment.businessId } });
  if (endpoints.length === 0) return;

  const body = JSON.stringify({
    type: "payment.paid",
    data: paymentView(payment, payment.business.name, payment.order),
  });
  const raw = Buffer.from(body, "utf8");

  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const secret = decrypt(endpoint.secretCipher);
      const signature = signHmacSha512(raw, secret);
      await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-flow-signature": signature,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });
    }),
  );
}
