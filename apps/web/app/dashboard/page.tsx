"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Icon } from "../../components/icon";

type Me = { email: string; business: { name: string; availableSats: string; balanceSats: string; reservedSats: string } };
type Payment = { id: string; amount: string; status: string; url: string; description?: string; buyerName?: string | null; buyerEmail?: string | null };

export default function OverviewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/auth/me").then(setMe).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load your workspace"));
    api<Payment[]>("/dashboard/payments").then(setPayments).catch((caught) => setPaymentsError(caught instanceof Error ? caught.message : "Could not load payments")).finally(() => setPaymentsLoading(false));
  }, []);

  if (error) return <div className="dashboard-feedback state-error" role="alert"><Icon name="alert" size={18}/>{error}<Link href="/login">Sign in</Link></div>;
  if (!me) return <div className="overview-loading" role="status" aria-label="Loading your workspace"><div className="invoice-skeleton big"/><div className="skeleton-list"><i/><i/><i/></div></div>;

  return <main className="overview-page">
    <div className="overview-heading"><div><p className="overview-kicker">YOUR OVERVIEW</p><h1>Welcome back, {me.business.name}.</h1><p>Here&apos;s what&apos;s happening with your business today.</p></div><span className="overview-account">{me.email}</span></div>
    <div className="overview-grid"><section className="balance-panel"><div><p>AVAILABLE BALANCE</p><h2>{me.business.availableSats} <span>sats</span></h2><span>Ready for your next move</span></div><div className="balance-orb" /></section><section className="overview-info-card"><span><Icon name="bolt" size={42}/></span><p>YOUR MONEY, IN MOTION</p><h2>Every payment has a place.</h2><p>Keep an eye on what&apos;s available and what&apos;s on its way.</p></section></div>
    <div className="overview-stats"><div><span>Total balance</span><strong>{me.business.balanceSats} sats</strong></div><div><span>Reserved balance</span><strong>{me.business.reservedSats} sats</strong></div><div><span>Payments</span><strong>{paymentsLoading ? "—" : paymentsError ? "Unavailable" : payments.length}</strong></div></div>
    <section className="overview-payments"><div className="overview-payments-heading"><div><span>ACTIVITY</span><h2>Recent payments</h2></div><Link href="/dashboard/products">Manage products ↗</Link></div>
      {paymentsError && <p className="p-6 text-sm text-[var(--danger)]">{paymentsError}</p>}
      {paymentsLoading && <div className="skeleton-list p-6"><i/><i/></div>}
      {!paymentsLoading && !paymentsError && payments.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">No payments yet. Create a product or payment link to get started.</p>}
      {payments.map((payment) => <a key={payment.id} className="payment-row" href={payment.url}><span><strong>{Number(payment.amount).toLocaleString()} sats</strong><small>{payment.description || "Payment"}</small><small>{payment.buyerEmail ? `Buyer-provided: ${payment.buyerName ? payment.buyerName + " · " : ""}${payment.buyerEmail}` : "Buyer details not provided"}</small></span><span className="payment-status">{payment.status.replaceAll("_", " ")}</span></a>)}
    </section>
  </main>;
}
