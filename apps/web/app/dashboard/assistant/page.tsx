"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Icon } from "../../../components/icon";

type Message = { id: number; role: "user" | "assistant"; text: string };
const prompts = ["What is my available balance?", "Which orders are unpaid?", "Show me my products"];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(message: string) {
    const text = message.trim();
    if (busy) return;
    if (!text) { setError("Write a message before sending."); return; }
    setError(""); setDraft(""); setBusy(true);
    setMessages((current) => [...current, { id: Date.now(), role: "user", text }]);
    try {
      const result = await api<{ reply: string }>("/dashboard/assistant", { method: "POST", body: JSON.stringify({ message: text }) });
      setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", text: result.reply }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Flow could not respond. Try again.");
      setDraft(text);
    } finally { setBusy(false); }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(draft); }

  return <main className="assistant-page">
    <div className="workspace-heading"><div><span className="page-eyebrow">YOUR WORKSPACE</span><h1>Flow Assistant</h1><p>Ask about your balance, products, and orders.</p></div><span className="heading-icon"><Icon name="sparkles" size={24}/></span></div>
    <section className="chat-panel" aria-label="Assistant conversation">
      <div className="chat-top"><span className="chat-avatar"><Icon name="sparkles" size={18}/></span><div><strong>Flow Assistant</strong><small>Here to help with your business</small></div><span className="chat-online"><span/> Available</span></div>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <div className="chat-welcome"><span className="welcome-icon"><Icon name="sparkles" size={28}/></span><h2>What can I help you with?</h2><p>Ask a question about your Flow workspace or choose a starting point.</p><div className="chat-prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)} disabled={busy}>{prompt}<Icon name="arrow-up-right" size={15}/></button>)}</div></div>}
        {messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><span className="message-avatar">{message.role === "assistant" ? <Icon name="sparkles" size={16}/> : "You"}</span><div><small>{message.role === "assistant" ? "Flow Assistant" : "You"}</small><p>{message.text}</p></div></div>)}
        {busy && <div className="chat-message assistant"><span className="message-avatar"><Icon name="sparkles" size={16}/></span><div><small>Flow Assistant</small><p className="typing-indicator">Thinking<span>.</span><span>.</span><span>.</span></p></div></div>}
        <div ref={endRef} />
      </div>
      <div className="chat-compose"><form noValidate onSubmit={onSubmit}><label className="sr-only" htmlFor="assistant-message">Your message</label><textarea id="assistant-message" value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} placeholder="Ask Flow anything about your business…" rows={2} disabled={busy}/><button type="submit" disabled={busy} aria-label="Send message"><Icon name="arrow-up-right" size={20}/></button></form>{error && <p className="form-error" role="alert">{error}</p>}<p>Flow answers from your workspace data. Verify important details before acting. <Link href="/dashboard/settings">Assistant settings</Link></p></div>
    </section>
  </main>;
}
