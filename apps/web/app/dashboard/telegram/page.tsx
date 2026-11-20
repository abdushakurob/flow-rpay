"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "../../../components/icon";

type TelegramStatus = { connected: false } | { connected: true; username: string; status: string };
export default function TelegramPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() { try { setStatus(await api<TelegramStatus>("/dashboard/telegram")); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load Telegram status."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function onConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const token = String(new FormData(formElement).get("token") ?? "").trim();
    if (!token) { setError("Paste your bot token to connect."); return; }
    setBusy(true); setError(""); setMessage("");
    try { const next = await api<TelegramStatus>("/dashboard/telegram/connect", { method: "POST", body: JSON.stringify({ token }) }); setStatus(next); setMessage(next.connected ? `Connected as @${next.username}.` : "Bot connected."); formElement.reset(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not connect the bot."); }
    finally { setBusy(false); }
  }
  async function onDisconnect() { setBusy(true); setError(""); setMessage(""); try { setStatus(await api<TelegramStatus>("/dashboard/telegram/disconnect", { method: "POST" })); setMessage("Bot disconnected."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not disconnect the bot."); } finally { setBusy(false); } }
  return <main className="workspace-page"><div className="workspace-heading"><div><span className="page-eyebrow">CONNECT WITH CUSTOMERS</span><h1>Telegram</h1><p>Make your product catalog available through your own bot.</p></div><span className="heading-icon"><Icon name="send" size={23}/></span></div><div className="workspace-columns"><section className="workspace-panel"><div className="panel-heading"><span className="panel-icon"><Icon name="send" size={18}/></span><div><h2>Bot connection</h2><p>Manage your customer-facing bot.</p></div></div>{loading ? <div className="skeleton-list"><i/><i/></div> : status?.connected ? <div className="connection-card"><span className="connection-badge"><Icon name="check" size={15}/> Connected</span><h2>@{status.username}</h2><p>Your catalog is available through this bot.</p><button className="secondary-action" type="button" disabled={busy} onClick={() => void onDisconnect()}>{busy ? "Disconnecting…" : "Disconnect bot"}</button></div> : <form className="flow-form" noValidate onSubmit={onConnect}><label>Bot token<input name="token" type="password" autoComplete="off" placeholder="Paste the token from BotFather" onChange={() => setError("")}/></label><p className="field-hint">Your token stays on the server. Never share it publicly.</p><button className="primary-action" disabled={busy} type="submit">{busy ? "Connecting…" : "Connect bot"}<Icon name="arrow-right" size={16}/></button></form>}{error && <div className="state-error" role="alert"><Icon name="alert" size={18}/><span>{error}</span>{!status && <button type="button" onClick={() => void load()}>Retry</button>}</div>}{message && <p className="state-success" role="status"><Icon name="check" size={16}/>{message}</p>}</section><aside className="workspace-panel"><span className="panel-icon"><Icon name="book" size={19}/></span><h2 className="aside-heading">How to connect</h2><ol className="steps-list"><li>Create a bot with BotFather in Telegram.</li><li>Copy the bot token and paste it here.</li><li>Send a message to your bot to explore your catalog.</li></ol><p className="field-hint">Your API must be publicly reachable for Telegram webhooks.</p></aside></div></main>;
}
