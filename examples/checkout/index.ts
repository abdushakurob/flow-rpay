import { Flow } from "@rpay/flow";

// Also available: flow.paymentLinks.create/retrieve/list, flow.webhooks.verify(rawBody, x-flow-signature, secret),
// and flow.withdrawals.local.quote/create (Flow API key only — no Bitnob credentials).

const flow = new Flow({
  apiKey: process.env.FLOW_API_KEY ?? "",
  baseUrl: process.env.API_URL ?? "http://localhost:4000",
});

const checkout = await flow.checkouts.create({
  amount: "25000",
  description: "Website design",
  reference: `order_${Date.now()}`,
});

console.log(checkout.url);
console.log(checkout.invoice);
