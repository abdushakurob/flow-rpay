import { Code } from "./code-block";

export function StorefrontDocs() {
  return <section id="storefront"><span className="docs-section-number">STOREFRONTS</span><h2>Storefronts & buyer details</h2><p>Each business has a public storefront URL in Dashboard → Products. It lists active products. A buyer chooses a product, provides an email and optional name, then continues to a Lightning invoice. Public reads use <code>GET /public/stores/:businessId</code>; checkout creation uses <code>POST /public/stores/:businessId/products/:productId/checkout</code>.</p><Code>{`POST /public/stores/BUSINESS_ID/products/PRODUCT_ID/checkout
Content-Type: application/json

{"buyerName":"Ada","buyerEmail":"ada@example.com"}`}</Code><p>Buyer contact details are self-reported and are not verified by Lightning. They appear in authenticated merchant payment responses and <code>payment.paid</code> webhooks as <code>buyerName</code> and <code>buyerEmail</code>. Public checkout responses omit them.</p></section>;
}
