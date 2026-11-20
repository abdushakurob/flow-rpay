"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { FlowMark } from "../../components/icon";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Enter your password."); return; }
    setError(""); setPending(true);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
      <a className="auth-brand" href="/"><FlowMark size={30}/> flow<span>.</span> <small>by RPay</small></a>
      <p className="auth-eyebrow">WELCOME BACK</p>
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p className="auth-description">Your business, payments, and next move are all here.</p>
      <form className="mt-8 flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">Email<input className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3" name="email" type="email" autoComplete="email" onChange={() => setError("")}/></label>
        <label className="flex flex-col gap-1 text-sm">Password<input className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3" name="password" type="password" autoComplete="current-password" onChange={() => setError("")}/></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm text-[var(--bg)]" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-switch">New to Flow? <a href="/register">Create an account ↗</a></p>
      </div>
    </main>
  );
}
