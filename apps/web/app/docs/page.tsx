import type { Metadata } from "next";
import Link from "next/link";
import { FlowMark } from "../../components/icon";
import { Code } from "./code-block";
import { StorefrontDocs } from "./storefront-docs";

export const metadata: Metadata = { title: "Developer documentation | Flow", description: "Build with Flow checkouts, payment links, withdrawals, and signed webhooks." };

const navigation = [["start","Getting started"],["auth","Authentication"],["checkouts","Checkouts"],["links","Payment links"],["storefront","Storefronts"],["withdrawals","Withdrawals"],["webhooks","Webhooks"],["errors","Errors & limits"]];

export default function DocsPage() {
  return <main className="docs-shell">
    <header className="docs-header"><div className="wrap"><Link className="brand" href="/"><FlowMark size={34}/><span>flow<span className="brand-period">.</span><small>by RPay</small></span></Link><span>Developer docs</span><Link href="/dashboard/developers">API keys ↗</Link></div></header>
    <div className="docs-layout wrap"><aside className="docs-sidebar"><span>IN THIS GUIDE</span><nav aria-label="Documentation sections">{navigation.map(([id,label])=><a href={`#${id}`} key={id}>{label}</a>)}</nav><p>Working from your dashboard? <Link href="/dashboard/developers">Open developer settings ↗</Link></p></aside>
      <article className="docs-content">
        <div className="docs-hero"><span className="eyebrow">FLOW API / VERSION 1</span><h1>Build payments into<br /><em>your flow.</em></h1><p>Create hosted Lightning checkouts, share product links, track transactions, and receive signed payment events.</p></div>
        <section id="start"><span className="docs-section-number">01 / THE BASICS</span><h2>Getting started</h2><p>Create an account, then generate an API key in <Link href="/dashboard/developers">Dashboard → Developers</Link>. Keep the key on your server. The API base URL is the address of your Flow API deployment. Local development defaults to <code>http://localhost:4000</code>.</p><div className="docs-callout"><strong>Check your network</strong><p>The banner identifies regtest, testnet, or mainnet. Regtest and testnet sats have no mainnet value. Current dashboard keys start with <code>flw_test_</code>.</p></div><h3>Your first checkout</h3><Code>{`POST /v1/checkouts
Authorization: Bearer YOUR_FLOW_API_KEY
Content-Type: application/json
Idempotency-Key: order-1042

{"amount":"2500","description":"Coffee","reference":"order-1042"}`}</Code><p>The response includes an <code>id</code>, hosted <code>url</code>, <code>invoice</code> when available, <code>status</code>, and <code>network</code>. Send the customer to the hosted URL, then confirm payment through the API or a webhook.</p></section>
        <section id="auth"><span className="docs-section-number">02 / ACCESS</span><h2>Authentication</h2><p>Send your API key as a bearer token with every <code>/v1</code> request. Never expose it in browser code or a public repository.</p><Code>{`Authorization: Bearer flw_test_...`}</Code><p>Every mutating <code>/v1</code> request requires an <code>Idempotency-Key</code> header of 8–200 characters. Reuse a key only to retry the same request. Reusing it for different input returns a conflict.</p></section>
        <section id="checkouts"><span className="docs-section-number">03 / ACCEPT PAYMENTS</span><h2>Checkouts & payments</h2><p><code>POST /v1/checkouts</code> and <code>POST /v1/payments</code> create a checkout from the same body. Amounts are positive integer sats encoded as strings, up to 100,000,000.</p><div className="docs-table"><div><strong>Field</strong><strong>Meaning</strong></div><div><code>amount</code><span>Required. Amount in sats as a string.</span></div><div><code>description</code><span>Required. 1–280 characters.</span></div><div><code>reference</code><span>Required. Your order reference, 1–80 characters.</span></div></div><p>Use <code>GET /v1/checkouts/:id</code> or <code>GET /v1/payments/:id</code> to retrieve a checkout. <code>GET /v1/transactions</code> returns the latest 50 payments.</p><h3>Node SDK</h3><Code>{`import { Flow } from "@rpay/flow";

const flow = new Flow({
  apiKey: process.env.FLOW_API_KEY!,
  baseUrl: process.env.FLOW_API_URL,
});
const checkout = await flow.checkouts.create({
  amount: "2500",
  description: "Coffee",
  reference: "order-1042",
});
console.log(checkout.url);`}</Code></section>
        <section id="links"><span className="docs-section-number">04 / SELL WITH A LINK</span><h2>Payment links</h2><p>Create a product in the dashboard, then call <code>POST /v1/payment-links</code> with its <code>productId</code> and an idempotency key. Share the returned URL. The buyer opens the reusable link, enters contact details, then gets a fresh invoice for that purchase.</p><Code>{`POST /v1/payment-links
Authorization: Bearer YOUR_FLOW_API_KEY
Idempotency-Key: product-link-1042
Content-Type: application/json

{"productId":"YOUR_PRODUCT_ID"}`}</Code><p>List links with <code>GET /v1/payment-links</code> or retrieve one with <code>GET /v1/payment-links/:id</code>.</p></section>
        <StorefrontDocs/><section id="withdrawals"><span className="docs-section-number">05 / MOVE FUNDS</span><h2>Withdrawals</h2><p>Use <code>POST /v1/withdrawals/bitcoin</code> with an <code>amount</code> and exactly one of <code>invoice</code> or <code>address</code>. For local payouts, request a quote, review it, then create the withdrawal with a beneficiary.</p><Code>{`POST /v1/withdrawals/local/quote
{"amount":"10000","country":"NG","currency":"NGN"}

POST /v1/withdrawals/local
{
  "quoteId":"QUOTE_ID",
  "amount":"10000",
  "country":"NG",
  "currency":"NGN",
  "beneficiary":{
    "destinationType":"bank",
    "accountName":"Ada Example",
    "accountNumber":"0123456789",
    "bankCode":"BANK_CODE"
  }
}`}</Code><p>Local payout availability depends on the deployment and supported corridors. Retrieve a withdrawal with <code>GET /v1/withdrawals/:id</code>.</p></section>
        <section id="webhooks"><span className="docs-section-number">06 / STAY IN SYNC</span><h2>Webhooks</h2><p>Add an HTTPS endpoint in <Link href="/dashboard/developers">Developer settings</Link>. Flow sends a <code>payment.paid</code> JSON event when a payment settles. The signing secret is shown once when you create the endpoint.</p><Code>{`{"type":"payment.paid","data":{"id":"...","status":"paid","amount":"2500"}}`}</Code><p>Verify <code>x-flow-signature</code> as a hex HMAC-SHA512 of the <strong>raw request body</strong> before processing. The SDK exposes <code>flow.webhooks.verify(rawBody, signature, secret)</code>. Make your handler idempotent. Delivery is currently best effort without automatic retries, so reconcile important orders with <code>GET /v1/payments/:id</code>.</p><Code>{`const valid = flow.webhooks.verify(
  rawBody,
  request.headers["x-flow-signature"] ?? "",
  process.env.FLOW_WEBHOOK_SECRET!
);
if (!valid) throw new Error("Invalid signature");`}</Code></section>
        <section id="errors"><span className="docs-section-number">07 / TROUBLESHOOTING</span><h2>Errors & limits</h2><p>Non-2xx responses include an <code>error</code> object with a message. Validate amounts, references, URLs, and idempotency keys before sending requests. Webhook endpoints require HTTPS, except localhost addresses used for development.</p><div className="docs-callout"><strong>Fast path</strong><p>Generate an API key, create a checkout with a unique reference, open its URL, and confirm <code>paid</code> before fulfilling the order.</p></div></section>
      </article>
    </div><footer className="docs-footer wrap"><span><FlowMark size={20}/> Flow by RPay</span><Link href="/">Back to Flow ↗</Link></footer>
  </main>;
}
