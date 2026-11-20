"use client";

import { useEffect, useState } from "react";
import { Icon } from "../components/icon";

type Health = { ok: boolean; network?: string; banner?: string };
export function NetworkBanner() {
  const [state, setState] = useState<{ text: string; network: string }>({ text: "Checking payment network…", network: "loading" });
  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
    let active = true;
    fetch(`${base}/health`).then((response) => { if (!response.ok) throw new Error("Health check failed"); return response.json() as Promise<Health>; }).then((health) => {
      if (!active) return;
      const network = health.network ?? "unknown";
      const text = health.banner ?? (network === "regtest" ? "Regtest · Local Bitcoin with no real value" : network === "mainnet" ? "Mainnet · Real Bitcoin payments" : network === "testnet" ? "Testnet · Demo sats with no mainnet value" : "Payment network status unavailable");
      setState({ text, network });
    }).catch(() => { if (active) setState({ text: "Payment network status unavailable", network: "unknown" }); });
    return () => { active = false; };
  }, []);
  return <div className={`network-banner network-${state.network}`} role="status"><Icon name={state.network === "unknown" ? "alert" : "shield"} size={14}/><span>{state.text}</span></div>;
}
