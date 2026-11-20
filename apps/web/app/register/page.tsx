"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { FlowMark } from "../../components/icon";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [countryError, setCountryError] = useState("");
  useEffect(() => { api<{ countries: { code: string; name: string }[] }>("/public/countries").then((result) => setCountries(result.countries)).catch(() => setCountryError("Country options are unavailable. Please try again later.")); }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const businessName = String(form.get("businessName") ?? "").trim();
    const country = String(form.get("country") ?? "").trim().toUpperCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email address."); setPending(false); return; }
    if (password.length < 8) { setError("Use at least 8 characters for your password."); setPending(false); return; }
    if (!businessName) { setError("Enter your business name."); setPending(false); return; }
    if (!/^[A-Z]{2}$/.test(country)) { setError("Select your business country."); setPending(false); return; }
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email, password, businessName, country,
        }),
      });
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the business");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
      <a className="auth-brand" href="/"><FlowMark size={30}/> flow<span>.</span> <small>by RPay</small></a>
      <p className="auth-eyebrow">GET STARTED</p>
      <h1 className="text-3xl font-semibold">Create a business</h1>
      <p className="auth-description">A clearer way to accept payments and keep moving.</p>
      <form className="mt-8 flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">Email<input className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3" name="email" type="email" autoComplete="email" onChange={() => setError("")}/></label>
        <label className="flex flex-col gap-1 text-sm">Password<input className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3" name="password" type="password" autoComplete="new-password" onChange={() => setError("")}/></label>
        <label className="flex flex-col gap-1 text-sm">Business name<input className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3" name="businessName" onChange={() => setError("")}/></label>
        <label className="flex flex-col gap-1 text-sm">Business country<select className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3" name="country" defaultValue="" disabled={countries.length === 0} onChange={() => setError("")}><option value="">{countries.length ? "Select your country" : "Loading countries…"}</option>{countries.map((country) => <option value={country.code} key={country.code}>{country.name}</option>)}</select></label>
        {countryError && <p className="form-error" role="alert">{countryError}</p>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm text-[var(--bg)] disabled:opacity-60" disabled={pending} type="submit">{pending ? "Creating…" : "Create business"}</button>
      </form>
      <p className="auth-switch">Already have an account? <a href="/login">Sign in ↗</a></p>
      </div>
    </main>
  );
}
