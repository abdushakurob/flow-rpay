"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { FlowMark, Icon } from "../../../components/icon";
import { BuyerCheckout, type StoreProduct } from "../../../components/buyer-checkout";

type Store = { id: string; name: string; products: StoreProduct[] };
export default function StorefrontPage() {
  const { id } = useParams<{ id: string }>();
  const [store, setStore] = useState<Store | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; api<Store>(`/public/stores/${id}`).then((result) => { if (!active) return; setStore(result); setSelectedId(result.products[0]?.id ?? null); setError(""); }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "This store is unavailable."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, retry]);
  const selected = store?.products.find((product) => product.id === selectedId);
  return <main className="store-shell"><header className="store-header"><Link href="/" className="checkout-brand"><FlowMark size={31}/><strong>flow<span>.</span></strong></Link><span>Merchant storefront</span></header><div className="store-content">
    {loading ? <div className="store-loading" role="status"><div className="invoice-skeleton big"/><div className="skeleton-list"><i/><i/><i/></div></div> : error ? <div className="store-error" role="alert"><Icon name="alert" size={28}/><h1>Store unavailable</h1><p>{error}</p><button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Try again</button></div> : store && <><div className="store-intro"><span className="page-eyebrow">WELCOME TO</span><h1>{store.name}</h1><p>Choose what you&apos;d like to buy and pay securely over Bitcoin Lightning.</p></div>{store.products.length === 0 ? <div className="store-empty"><Icon name="package" size={25}/><h2>Nothing for sale yet</h2><p>Check back soon for new products.</p></div> : <div className="store-grid"><section className="store-products" aria-label="Products"><div className="store-section-heading"><h2>Products</h2><span>{store.products.length} available</span></div>{store.products.map((product) => <button type="button" className="store-product" aria-pressed={product.id === selectedId} key={product.id} onClick={() => setSelectedId(product.id)}><span className="store-product-icon"><Icon name="package" size={20}/></span><span className="store-product-copy"><strong>{product.name}</strong><small>{product.description || "Digital product"}</small></span><span className="store-product-price">{Number(product.priceSats).toLocaleString()} sats<Icon name="arrow-right" size={16}/></span></button>)}</section>{selected && <BuyerCheckout key={selected.id} businessName={store.name} product={selected} endpoint={`/public/stores/${store.id}/products/${selected.id}/checkout`}/>}</div>}</>}
  </div><footer className="store-footer"><Icon name="shield" size={15}/> Payments powered by Flow by RPay</footer></main>;
}
