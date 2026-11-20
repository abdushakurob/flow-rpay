"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "../../../components/icon";

type Business = { aiMode: string; openaiModel: string; hasOwnKey: boolean; country: string };
export default function SettingsPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("flow");
  const [country, setCountry] = useState("");
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() { try { const result = await api<{ business: Business }>("/auth/me"); setBusiness(result.business); setMode(result.business.aiMode); setCountry(result.business.country); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load settings."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => { api<{ countries: { code: string; name: string }[] }>("/public/countries").then((result) => setCountries(result.countries)).catch(() => undefined); }, []);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const country = String(form.get("country") ?? "").trim().toUpperCase();
    const openaiModel = String(form.get("openaiModel") ?? "").trim();
    const openaiKey = String(form.get("openaiKey") ?? "").trim();
    if (!/^[A-Z]{2}$/.test(country)) { setError("Select your business country."); return; }
    if (!openaiModel) { setError("Enter an assistant model."); return; }
    if (mode === "byok" && !business?.hasOwnKey && !openaiKey) { setError("Paste your OpenAI key to use your own key."); return; }
    setBusy(true); setError(""); setMessage("");
    try { const updated = await api<Business>("/dashboard/settings", { method: "PATCH", body: JSON.stringify({ aiMode: mode, openaiModel, openaiKey: openaiKey || undefined, country }) }); setBusiness(updated); setMessage("Settings saved."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  return <main className="workspace-page"><div className="workspace-heading"><div><span className="page-eyebrow">YOUR PREFERENCES</span><h1>Settings</h1><p>Choose how Flow works for your business.</p></div><span className="heading-icon"><Icon name="settings" size={23}/></span></div>{loading ? <div className="workspace-panel settings-panel"><div className="skeleton-list"><i/><i/><i/></div></div> : business ? <div className="settings-layout"><section className="workspace-panel settings-panel"><div className="panel-heading"><span className="panel-icon"><Icon name="settings" size={18}/></span><div><h2>Business preferences</h2><p>Keep your details and assistant setup current.</p></div></div><form className="flow-form" noValidate onSubmit={onSubmit}><label>Business country<select name="country" value={country} onChange={(event) => { setCountry(event.target.value); setError(""); }} disabled={countries.length === 0}><option value="">{countries.length ? "Select your country" : "Loading countries"}</option>{countries.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label><div className="settings-divider"/><div><strong className="settings-section-title">Assistant</strong><p className="field-hint">Choose who provides AI responses in the Assistant tab.</p></div><label>Assistant mode<select name="aiMode" value={mode} onChange={(event) => { setMode(event.target.value); setError(""); }}><option value="flow">Flow AI</option><option value="byok">My OpenAI key</option></select></label><label>Model<input name="openaiModel" defaultValue={business.openaiModel} onChange={() => setError("")}/></label>{mode === "byok" && <label>OpenAI key<input name="openaiKey" type="password" autoComplete="off" placeholder={business.hasOwnKey ? "Key saved. Paste a new key to replace it." : "Paste your OpenAI key"} onChange={() => setError("")}/></label>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="state-success" role="status"><Icon name="check" size={17}/>{message}</p>}<button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}<Icon name="check" size={16}/></button></form></section><aside className="workspace-panel settings-aside"><span className="panel-icon"><Icon name="shield" size={20}/></span><h2>Your key stays private.</h2><p>When you provide your own key, Flow stores it encrypted. You can replace it here at any time.</p></aside></div> : <div className="state-error" role="alert"><Icon name="alert" size={18}/>{error}<button type="button" onClick={() => void load()}>Retry</button></div>}</main>;
}
