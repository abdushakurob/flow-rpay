"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "../../../components/icon";

type LocalStatus = {
  configured: boolean;
  webhookSecretSet: boolean;
  environment: string | null;
  reason?: string;
  message?: string;
  webhookUrl: string;
};
type Country = { code?: string; name?: string; corridors?: Array<{ currency?: string; destination_types?: string[] }> };
type Quote = { quoteId: string | null; localAmount: string | null; currency: string | null };
type LocalInput = {
  amount: string;
  country: string;
  currency: string;
  beneficiary: {
    destinationType: "bank" | "mobile_money";
    accountName: string;
    accountNumber: string;
    bankCode?: string;
    network?: string;
  };
};
const validSats = (value: string) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 100_000_000n;

export default function WithdrawPage() {
  const [mode, setMode] = useState<"bitcoin" | "local">("bitcoin");
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [homeCountry, setHomeCountry] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [localInput, setLocalInput] = useState<LocalInput | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await api<LocalStatus>("/dashboard/withdrawals/local/status");
        if (!active) return;
        setStatus(next);
        if (next.configured) {
          const listed = await api<{ countries: Country[] }>("/dashboard/withdrawals/local/countries");
          if (active) setCountries(listed.countries);
        }
      } catch {
        if (active) setStatus(null);
      } finally {
        if (active) setLoadingRoutes(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    api<{ business: { country: string } }>("/auth/me")
      .then((result) => setHomeCountry(result.business.country))
      .catch(() => undefined);
  }, []);

  async function onBitcoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = String(form.get("amount") ?? "").trim();
    const destination = String(form.get("destination") ?? "").trim();
    if (!validSats(amount)) {
      setError("Enter an amount from 1 to 100,000,000 sats.");
      return;
    }
    if (!destination) {
      setError("Enter a Lightning invoice or Bitcoin address.");
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await api<{ status: string }>("/dashboard/withdrawals/bitcoin", {
        method: "POST",
        body: JSON.stringify(destination.toLowerCase().startsWith("ln") ? { amount, invoice: destination } : { amount, address: destination }),
      });
      setMessage(`Bitcoin withdrawal ${result.status.replaceAll("_", " ")}.`);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onLocal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: LocalInput = {
      amount: String(form.get("amount") ?? "").trim(),
      country: String(form.get("country") ?? "").trim().toUpperCase(),
      currency: String(form.get("currency") ?? "").trim().toUpperCase(),
      beneficiary: {
        destinationType: form.get("destinationType") === "mobile_money" ? "mobile_money" : "bank",
        accountName: String(form.get("accountName") ?? "").trim(),
        accountNumber: String(form.get("accountNumber") ?? "").trim(),
        bankCode: String(form.get("bankCode") ?? "").trim() || undefined,
        network: String(form.get("network") ?? "").trim() || undefined,
      },
    };
    if (!validSats(input.amount)) {
      setError("Enter an amount from 1 to 100,000,000 sats.");
      return;
    }
    if (!/^[A-Z]{2}$/.test(input.country)) {
      setError("Enter a two-letter country code.");
      return;
    }
    if (!/^[A-Z]{3,8}$/.test(input.currency)) {
      setError("Enter a valid currency code.");
      return;
    }
    if (!input.beneficiary.accountName || !input.beneficiary.accountNumber) {
      setError("Enter the account name and number.");
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await api<Quote>("/dashboard/withdrawals/local/quote", {
        method: "POST",
        body: JSON.stringify({ amount: input.amount, country: input.country, currency: input.currency }),
      });
      if (!result.quoteId) throw new Error("The quote did not include an ID.");
      setQuote(result);
      setLocalInput(input);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not get a quote.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLocal() {
    if (!quote?.quoteId || !localInput) return;
    setBusy(true);
    setError("");
    try {
      await api("/dashboard/withdrawals/local", {
        method: "POST",
        body: JSON.stringify({ ...localInput, quoteId: quote.quoteId }),
      });
      setMessage("Local withdrawal started. Status updates when the payout route confirms settlement.");
      setQuote(null);
      setLocalInput(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  const currencies = [
    ...new Set(
      (countries.find((country) => country.code === selectedCountry)?.corridors ?? [])
        .map((route) => route.currency)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const localUnavailableCopy =
    status?.reason === "invalid_credentials"
      ? "Local payout credentials were rejected. Add a valid sandbox Client ID and Client Secret, then restart the API."
      : status?.reason === "webhook_unconfigured"
        ? "Local payouts need a webhook signing secret and a public HTTPS API URL before confirm."
        : status?.reason === "not_sandbox"
          ? "Local payouts are sandbox-only until live credentials are intentionally enabled."
          : status?.message || "This deployment does not have a local payout route configured yet.";

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <span className="page-eyebrow">MOVE YOUR MONEY</span>
          <h1>Withdraw</h1>
          <p>Choose where your sats go next.</p>
        </div>
        <span className="heading-icon">
          <Icon name="wallet" size={24} />
        </span>
      </div>
      {mode === "local" && status?.configured && homeCountry && !countries.some((country) => country.code === homeCountry) && (
        <div className="country-notice" role="status">
          <Icon name="alert" size={18} />
          <span>
            Local payouts are not available in your country ({homeCountry}) yet. Bitcoin withdrawals remain available. You can choose another supported destination below if it applies to you.
          </span>
        </div>
      )}
      <div className="withdraw-layout">
        <section className="workspace-panel">
          <div className="mode-tabs" role="tablist" aria-label="Withdrawal type">
            <button
              role="tab"
              aria-selected={mode === "bitcoin"}
              type="button"
              onClick={() => {
                setMode("bitcoin");
                setError("");
                setQuote(null);
              }}
            >
              <Icon name="bolt" size={17} /> Bitcoin
            </button>
            <button
              role="tab"
              aria-selected={mode === "local"}
              type="button"
              onClick={() => {
                setMode("local");
                setError("");
              }}
            >
              <Icon name="credit-card" size={17} /> Local currency
            </button>
          </div>
          {mode === "bitcoin" ? (
            <div role="tabpanel">
              <div className="panel-intro">
                <h2>Send Bitcoin</h2>
                <p>Move sats to a Lightning invoice or an on-chain address supported by this deployment.</p>
              </div>
              <form className="flow-form" noValidate onSubmit={onBitcoin}>
                <label>
                  Amount in sats
                  <input name="amount" inputMode="numeric" placeholder="e.g. 10000" onChange={() => setError("")} />
                </label>
                <label>
                  Destination
                  <textarea name="destination" rows={3} placeholder="Paste a Lightning invoice or Bitcoin address" onChange={() => setError("")} />
                </label>
                <p className="field-hint">Double-check the destination before sending. Bitcoin transfers cannot be reversed.</p>
                <button className="primary-action" disabled={busy} type="submit">
                  {busy ? "Sending…" : "Send Bitcoin"}
                  <Icon name="arrow-right" size={16} />
                </button>
              </form>
            </div>
          ) : (
            <div role="tabpanel">
              <div className="panel-intro">
                <h2>Local currency payout</h2>
                <p>Get a quote first, then review and confirm. Sandbox payouts do not move real money.</p>
              </div>
              {loadingRoutes ? (
                <div className="skeleton-list">
                  <i />
                  <i />
                </div>
              ) : status?.configured ? (
                <>
                  <div className="route-status">
                    <Icon name="check" size={17} />
                    {status.environment === "sandbox" ? "Sandbox route · test payouts only" : "Payout route available"}
                  </div>
                  {countries.length > 0 && (
                    <p className="field-hint">
                      Available corridors:{" "}
                      {countries
                        .map((country) => `${country.code ?? "?"} ${(country.corridors ?? []).map((route) => route.currency).filter(Boolean).join("/")}`)
                        .join(", ")}
                    </p>
                  )}
                  <form className="flow-form" noValidate onSubmit={onLocal}>
                    <label>
                      Amount in sats
                      <input name="amount" inputMode="numeric" placeholder="e.g. 10000" onChange={() => setError("")} />
                    </label>
                    <div className="form-grid">
                      <label>
                        Destination country
                        <select
                          name="country"
                          value={selectedCountry}
                          onChange={(event) => {
                            setSelectedCountry(event.target.value);
                            setError("");
                          }}
                        >
                          <option value="">Select a country</option>
                          {countries.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name || country.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Currency
                        <select name="currency" key={selectedCountry} defaultValue="" onChange={() => setError("")} disabled={!selectedCountry}>
                          <option value="">Select a currency</option>
                          {currencies.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Destination type
                      <select name="destinationType">
                        <option value="bank">Bank account</option>
                        <option value="mobile_money">Mobile money</option>
                      </select>
                    </label>
                    <label>
                      Account name
                      <input name="accountName" placeholder="Name on account" onChange={() => setError("")} />
                    </label>
                    <label>
                      Account number
                      <input name="accountNumber" placeholder="Account number" onChange={() => setError("")} />
                    </label>
                    <div className="form-grid">
                      <label>
                        Bank code <span className="optional">If applicable</span>
                        <input name="bankCode" placeholder="Bank code" />
                      </label>
                      <label>
                        Network <span className="optional">If applicable</span>
                        <input name="network" placeholder="Mobile network" />
                      </label>
                    </div>
                    <button className="primary-action" disabled={busy} type="submit">
                      {busy ? "Getting quote…" : "Review quote"}
                      <Icon name="arrow-right" size={16} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="credit-card" size={28} />
                  <strong>Local payouts are unavailable</strong>
                  <p>{localUnavailableCopy}</p>
                  {status?.webhookUrl ? <p className="field-hint">Webhook path when ready: {status.webhookUrl}</p> : null}
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="state-success" role="status">
              <Icon name="check" size={17} />
              {message}
            </p>
          )}
        </section>
        <aside className="workspace-panel withdraw-aside">
          <span className="panel-icon">
            <Icon name="shield" size={20} />
          </span>
          <h2>Move with confidence.</h2>
          <p>Review every amount and destination before you submit. Your available balance appears on the overview page.</p>
          <div>
            <Icon name="clock" size={16} />
            <span>Local payouts settle after funding and a confirmed webhook. Use a public HTTPS API URL in production.</span>
          </div>
        </aside>
      </div>
      {quote && localInput && (
        <div className="modal-backdrop">
          <section className="quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-title">
            <span className="panel-icon">
              <Icon name="credit-card" size={20} />
            </span>
            <h2 id="quote-title">Review your payout</h2>
            <p>Check these details before starting the withdrawal. Sandbox routes do not move real money.</p>
            <dl>
              <div>
                <dt>You send</dt>
                <dd>{localInput.amount} sats</dd>
              </div>
              <div>
                <dt>Recipient receives</dt>
                <dd>
                  {quote.localAmount ?? "Quoted amount"} {quote.currency ?? localInput.currency}
                </dd>
              </div>
              <div>
                <dt>To</dt>
                <dd>
                  {localInput.beneficiary.accountName} · {localInput.beneficiary.accountNumber}
                </dd>
              </div>
            </dl>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setQuote(null);
                  setLocalInput(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="primary-action" onClick={() => void confirmLocal()} disabled={busy}>
                {busy ? "Starting…" : "Confirm withdrawal"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
