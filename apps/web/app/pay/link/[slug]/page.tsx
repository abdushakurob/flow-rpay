"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { FlowMark, Icon } from "../../../../components/icon";
import { BuyerCheckout, type StoreProduct } from "../../../../components/buyer-checkout";

type LinkDetail = { businessId: string; businessName: string; product: StoreProduct };
export default function LinkPage() {
  const { slug } = useParams<{ slug: string }>();
  const [detail, setDetail] = useState<LinkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; api<LinkDetail>(`/public/links/${slug}`).then((result) => { if (active) { setDetail(result); setError(""); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "This payment link is unavailable."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [slug, retry]);
  return <main className="store-shell"><header className="store-header"><Link href="/" className="checkout-brand"><FlowMark size={31}/><strong>flow<span>.</span></strong></Link><span>Secure checkout <Icon name="shield" size={15}/></span></header><div className="store-content link-content">{loading ? <div className="store-loading" role="status"><div className="invoice-skeleton big"/><div className="skeleton-list"><i/><i/></div></div> : error ? <div className="store-error" role="alert"><Icon name="alert" size={28}/><h1>Link unavailable</h1><p>{error}</p><button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Try again</button></div> : detail && <div className="link-grid"><div className="link-intro"><span className="page-eyebrow">PAYMENT LINK</span><h1>A simple way to pay {detail.businessName}.</h1><p>Review your order, share your contact details with the seller, then pay the invoice with your Lightning wallet.</p><Link href={`/store/${detail.businessId}`}>View all products <Icon name="arrow-right" size={16}/></Link></div><BuyerCheckout businessName={detail.businessName} product={detail.product} endpoint={`/public/links/${slug}/checkout`}/></div>}</div><footer className="store-footer"><Icon name="shield" size={15}/> Payments powered by Flow by RPay</footer></main>;
}
