"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "./icon";

export type StoreProduct = { id: string; name: string; description: string; priceSats: string };

export function BuyerCheckout({ businessName, product, endpoint }: { businessName: string; product: StoreProduct; endpoint: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const buyerName = String(form.get("buyerName") ?? "").trim();
    const buyerEmail = String(form.get("buyerEmail") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) { setError("Enter a valid email so the seller can identify your order."); return; }
    if (buyerName.length > 120) { setError("Keep your name under 120 characters."); return; }
    setError(""); setPending(true);
    try {
      const checkout = await api<{ id: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ buyerName: buyerName || undefined, buyerEmail }),
      });
      router.push(`/pay/${checkout.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare your invoice. Try again.");
      setPending(false);
    }
  }
  return <section className="buyer-checkout" aria-label="Checkout details">
    <div className="buyer-card-heading"><span className="page-eyebrow">YOUR ORDER</span><span className="buyer-merchant">{businessName}</span></div>
    <h2>{product.name}</h2>{product.description && <p className="buyer-description">{product.description}</p>}
    <div className="buyer-total"><span>Total</span><strong>{Number(product.priceSats).toLocaleString()} <small>sats</small></strong></div>
    <form noValidate onSubmit={onSubmit}><div className="buyer-form-heading"><Icon name="credit-card" size={18}/><strong>Your details</strong></div><p>These details help {businessName} recognize your payment. They are provided by you and are not verified by your wallet.</p><label htmlFor="buyer-name">Name <span>Optional</span></label><input id="buyer-name" name="buyerName" autoComplete="name" placeholder="Your name" onChange={() => setError("")}/><label htmlFor="buyer-email">Email address</label><input id="buyer-email" name="buyerEmail" type="email" autoComplete="email" placeholder="you@example.com" onChange={() => setError("")}/>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" disabled={pending}>{pending ? "Preparing invoice…" : "Continue to Lightning payment"}<Icon name="arrow-right" size={16}/></button></form>
    <div className="buyer-secure"><Icon name="shield" size={16}/> Secure checkout by Flow</div>
  </section>;
}
