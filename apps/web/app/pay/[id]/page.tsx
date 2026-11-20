"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { Icon, FlowMark } from "../../../components/icon";

type Checkout = { businessName?: string; description?: string; amount: string; invoice: string | null; status: string; expiresAt: string | null; network?: string; id?: string };

function InvoiceExpiry({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const end = new Date(expiresAt);
  const remaining = Math.max(0, Math.ceil((end.getTime() - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  return <div className="invoice-expiry" role="timer"><div><Icon name="clock" size={17}/><strong>{remaining > 0 ? `Pay within ${minutes}m ${seconds}s` : "Time has run out"}</strong></div><small>{remaining > 0 ? `Valid until ${end.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} in your local time.` : "The payment status will update shortly."}</small></div>;
}

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let timer: number;
    let cancelled = false;
    async function load() {
      try {
        const next = await api<Checkout>(`/public/checkouts/${params.id}`);
        if (cancelled) return;
        setCheckout(next); setError("");
        if (next.status === "awaiting_payment") timer = window.setTimeout(load, 3000);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Checkout unavailable.");
      }
    }
    void load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [params.id]);

  async function copyInvoice() {
    if (!checkout?.invoice) return;
    try { await navigator.clipboard.writeText(checkout.invoice); setCopied(true); }
    catch { setError("Could not copy the invoice. Select the invoice text below."); }
  }

  const isPaid = checkout?.status === "paid";
  const isPending = checkout?.status === "awaiting_payment";
  return <main className="checkout-shell"><header className="checkout-header"><Link href="/" className="checkout-brand"><FlowMark size={30}/><strong>flow<span>.</span></strong></Link><span>Secure checkout <Icon name="shield" size={15}/></span></header>
    <div className="checkout-layout"><div className="checkout-intro"><span className="page-eyebrow">PAYMENT REQUEST</span><h1>{isPaid ? "Payment complete." : "Almost there."}</h1><p>{isPaid ? "Your payment has been received. You can return to the merchant." : "Review the details and pay with any compatible Lightning wallet."}</p><div className="checkout-trust"><Icon name="shield" size={19}/><span>Powered by Flow by RPay</span></div></div>
      <section className="invoice-card" aria-label="Payment invoice"><div className="invoice-top"><span className="invoice-mark"><FlowMark size={24}/></span><span>INVOICE <small>#{params.id.slice(0,8).toUpperCase()}</small></span></div>
        {error && !checkout ? <div className="invoice-state" role="alert"><Icon name="alert" size={27}/><h2>We couldn&apos;t open this invoice</h2><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div> : !checkout ? <div className="invoice-loading" role="status"><div className="invoice-skeleton big"/><div className="invoice-skeleton"/><div className="invoice-skeleton"/><p>Preparing your invoice…</p></div> : <>
          <div className="invoice-merchant"><span>PAYING</span><strong>{checkout.businessName || "Flow merchant"}</strong></div><div className="invoice-amount"><span>AMOUNT DUE</span><div><strong>{Number(checkout.amount).toLocaleString()}</strong><span>sats</span></div><p>Bitcoin over Lightning</p></div>
          <div className="invoice-divider"/><div className="invoice-detail"><span>Description</span><strong>{checkout.description || "Payment"}</strong></div><div className="invoice-detail"><span>Network</span><strong>{checkout.network || "Lightning"}</strong></div><div className="invoice-detail"><span>Status</span><strong className={isPaid ? "invoice-status paid" : "invoice-status"}><Icon name={isPaid ? "check" : "clock"} size={14}/>{isPaid ? "Paid" : checkout.status.replaceAll("_"," ")}</strong></div>
          {isPending && checkout.invoice && <div className="invoice-pay"><div className="invoice-qr"><QRCodeSVG value={checkout.invoice} size={176} marginSize={1}/></div><h2>Scan to pay</h2><p>Open your Lightning wallet and scan this code.</p><button type="button" onClick={() => void copyInvoice()}><Icon name={copied ? "check" : "copy"} size={16}/>{copied ? "Invoice copied" : "Copy Lightning invoice"}</button><details><summary>Show invoice text</summary><p>{checkout.invoice}</p></details>{checkout.expiresAt && <InvoiceExpiry expiresAt={checkout.expiresAt}/>}</div>}
          {isPaid && <div className="invoice-success" role="status"><Icon name="check" size={20}/><div><strong>Payment received</strong><p>This invoice has been paid successfully.</p></div></div>}
          {!isPaid && !isPending && <div className="invoice-expired" role="status"><Icon name="alert" size={18}/>This invoice is {checkout.status.replaceAll("_"," ")}. Request a new link from the merchant.</div>}
        </>}
      </section></div><footer className="checkout-footer">Secure payments by Flow by RPay</footer>
  </main>;
}
