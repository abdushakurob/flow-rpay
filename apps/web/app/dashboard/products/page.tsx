"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "../../../components/icon";

type Product = { id: string; name: string; description: string; priceSats: string };
type PaymentLink = { id: string; productId: string; url: string; status: string };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [storefrontCopied, setStorefrontCopied] = useState(false);

  async function load() {
    try { const [nextProducts, nextLinks, me] = await Promise.all([api<Product[]>("/dashboard/products"), api<PaymentLink[]>("/dashboard/payment-links"), api<{ business: { storefrontUrl: string } }>("/auth/me")]); setProducts(nextProducts); setLinks(nextLinks); setStorefrontUrl(me.business.storefrontUrl); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load products."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const priceSats = String(form.get("priceSats") ?? "").trim();
    if (!name) { setFormError("Enter a product name."); return; }
    if (!/^[1-9]\d*$/.test(priceSats) || BigInt(priceSats) > 100_000_000n) { setFormError("Enter a price from 1 to 100,000,000 sats."); return; }
    if (description.length > 2000) { setFormError("Keep the description under 2,000 characters."); return; }
    setFormError(""); setBusy(true);
    try {
      await api("/dashboard/products", { method: "POST", body: JSON.stringify({ name, description, priceSats }) });
      formElement.reset();
      await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Could not add the product."); }
    finally { setBusy(false); }
  }

  async function createLink(productId: string) {
    setError(""); setLinking(productId); setLink(""); setCopied(false);
    try { const result = await api<PaymentLink>("/dashboard/payment-links", { method: "POST", body: JSON.stringify({ productId }) }); setLink(result.url); setLinks((current) => [result, ...current]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the payment link."); }
    finally { setLinking(null); }
  }

  async function copyLink(url = link) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setLink(url); }
    catch { setError("Could not copy the link. Select and copy it below."); }
  }

  return <main className="workspace-page">
    <div className="workspace-heading"><div><span className="page-eyebrow">SELL WITH FLOW</span><h1>Products</h1><p>Create a product once, then share its reusable payment link. Each customer gets a fresh invoice.</p></div><span className="heading-icon"><Icon name="package" size={24}/></span></div>
    {storefrontUrl && <section className="storefront-share"><div className="storefront-share-icon"><Icon name="grid" size={21}/></div><div><span>YOUR STOREFRONT</span><h2>One place for all your products.</h2><p>Share this page so customers can browse and pay.</p><code>{storefrontUrl}</code></div><div className="storefront-share-actions"><a href={storefrontUrl} target="_blank" rel="noreferrer">View store <Icon name="external" size={15}/></a><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(storefrontUrl); setStorefrontCopied(true); } catch { setError("Could not copy the storefront link."); } }}><Icon name={storefrontCopied ? "check" : "copy"} size={15}/>{storefrontCopied ? "Copied" : "Copy link"}</button></div></section>}
    <div className="workspace-columns"><section className="workspace-panel"><div className="panel-heading"><span className="panel-icon"><Icon name="plus" size={18}/></span><div><h2>Add a product</h2><p>Keep the details clear for your customer.</p></div></div><form className="flow-form" noValidate onSubmit={onSubmit}><label>Product name<input name="name" placeholder="e.g. Design consultation" maxLength={80} onChange={() => setFormError("")}/></label><label>Description <span className="optional">Optional</span><textarea name="description" placeholder="What is included?" rows={3} onChange={() => setFormError("")}/></label><label>Price in sats<input name="priceSats" inputMode="numeric" placeholder="2500" onChange={() => setFormError("")}/></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-action" type="submit" disabled={busy}>{busy ? "Adding product…" : "Add product"}<Icon name="arrow-right" size={16}/></button></form></section>
      <section className="workspace-panel"><div className="panel-heading"><span className="panel-icon"><Icon name="grid" size={18}/></span><div><h2>Your catalog</h2><p>{loading ? "Loading products" : `${products.length} product${products.length === 1 ? "" : "s"}`}</p></div></div>{error && <div className="state-error" role="alert"><Icon name="alert" size={18}/><span>{error}</span><button onClick={() => void load()} type="button">Retry</button></div>}{loading ? <div className="skeleton-list"><i/><i/><i/></div> : products.length === 0 && !error ? <div className="empty-state"><Icon name="package" size={25}/><strong>No products yet</strong><p>Add your first product to create a payment link.</p></div> : <div className="product-list">{products.map((product) => <article className="product-item" key={product.id}><div className="product-glyph"><Icon name="package" size={19}/></div><div><strong>{product.name}</strong><span>{product.priceSats} sats</span>{product.description && <small>{product.description}</small>}</div><button type="button" disabled={linking === product.id} onClick={() => { const existing = links.find((item) => item.productId === product.id && item.status === "active"); if (existing) void copyLink(existing.url); else void createLink(product.id); }}>{linking === product.id ? "Creating link" : links.some((item) => item.productId === product.id && item.status === "active") ? "Copy link" : "Create link"}<Icon name={links.some((item) => item.productId === product.id && item.status === "active") ? "copy" : "link"} size={15}/></button></article>)}</div>}{link && <div className="created-link" role="status"><strong>Payment link ready</strong><div><input aria-label="Payment link" readOnly value={link}/><button type="button" onClick={() => void copyLink()}><Icon name={copied ? "check" : "copy"} size={16}/>{copied ? "Copied" : "Copy"}</button></div></div>}</section></div>
  </main>;
}
