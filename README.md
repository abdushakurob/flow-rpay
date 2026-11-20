# Flow

Lightning commerce. Buyers pay a Flow invoice on Flow’s Lightning backend. Merchants withdraw Bitcoin from that backend, or local currency through Bitnob (withdrawals only — never for sales invoices).

## Run

1. Copy `.env.example` to `.env`.
2. `docker compose up -d` — starts **Postgres only**. No local bitcoind/LND (avoids multi-GB IBD on metered connections).
3. Configure **NWC** (Nostr Wallet Connect) — see below.
4. `pnpm install`
5. `pnpm db:generate`
6. `pnpm db:push`
7. `pnpm dev`

Web: http://localhost:3000 · API: http://localhost:4000

The API refuses Lightning work until a backend is configured. It never invents invoices.

## Lightning: NWC (primary — hackathon)

Flow talks to a wallet over [Nostr Wallet Connect](https://nwc.dev) using [`@getalby/sdk`](https://www.npmjs.com/package/@getalby/sdk). No CoinOS signup, no OpenNode approval, no Voltage invite, no local IBD.

| Variable | Purpose |
| --- | --- |
| `NWC_CONNECTION_STRING` | Full `nostr+walletconnect://…` URI from the faucet or Alby Hub |
| `LIGHTNING_NETWORK` | Optional banner hint (`testnet` / `mainnet` / `regtest`) |

### Signup (do this next)

1. **Create a test wallet** (pick one):
   - **Faucet API (fastest):**

```powershell
# Returns a nostr+walletconnect://... string (keep it secret)
Invoke-RestMethod -Method POST -Uri "https://faucet.nwc.dev?balance=10000"
```

   - **Sandbox UI:** open **https://sandbox.albylabs.com/**, create/test wallets, copy a connection string.
   - **Production later:** connect a real wallet at [nwc.dev](https://nwc.dev) / Alby Hub and paste that string instead.

2. Put the string in `.env`:

```env
NWC_CONNECTION_STRING=nostr+walletconnect://...
# leave COINOS_TOKEN, OPENNODE_*, and LND_* empty (or filled — NWC still wins when set)
```

3. Restart `pnpm dev`. Logs should show `Lightning ready via NWC (Nostr Wallet Connect)`.
4. Create a checkout. Pay the BOLT11 with a **second** faucet wallet (same isolated system), or use the sandbox playground. Faucet wallets cannot pay real external Lightning wallets.

Docs: [nwc.dev](https://nwc.dev) · Faucet: [faucet.nwc.dev](https://faucet.nwc.dev) · Sandbox: [sandbox.albylabs.com](https://sandbox.albylabs.com/)

### Honesty / limits (read this)

- **NWC faucet = demo sats** — isolated test wallets, not spendable on public Lightning. Banner says so.
- **Settlement** — Flow polls NWC `lookup_invoice` by payment hash. Paid only when the wallet reports `settled` (preimage checked when present). Never invents success.
- **Lightning withdraw** — `pay_invoice` via the same NWC connection (needs budget/balance on that wallet).
- **On-chain withdraw** — **not supported over NWC**. Use a Lightning invoice, or CoinOS/LND, or Bitnob for local currency.
- Provider priority when multiple are set: **NWC → CoinOS → OpenNode → LND**.

## Why not the usual “testnet API” options?

| Option | Why it is not primary |
| --- | --- |
| **CoinOS** | Works, but mainnet custodial real sats — still supported as fallback. |
| **OpenNode development** | Often requires request/approval before keys work. |
| **Voltage / hosted LND** | Invite or paid gate; also needs TLS + macaroon setup. |
| **Local bitcoind testnet** | Multi-GB IBD — rejected for metered connections. |

## Optional: CoinOS (mainnet custodial)

Only if you leave `NWC_CONNECTION_STRING` empty:

```env
COINOS_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

Register at [coinos.io](https://coinos.io) → Settings → API token. Real sats — use tiny amounts.

## Optional: OpenNode Development (testnet)

```env
# Leave NWC_CONNECTION_STRING and COINOS_TOKEN empty
OPENNODE_API_KEY=your_dev_api_key
OPENNODE_API_URL=https://dev-api.opennode.com
```

Flow rejects non-dev OpenNode hosts (`api.opennode.com`).

## Optional: Hosted LND REST

Leave `NWC_CONNECTION_STRING`, `COINOS_TOKEN`, and `OPENNODE_API_KEY` empty and set:

| Variable | Purpose |
| --- | --- |
| `LND_REST_URL` | HTTPS base, e.g. `https://….t.voltageapp.io:8080` |
| `LND_MACAROON` | Hex-encoded admin (or invoice+pay) macaroon |
| `LND_TLS_CERT_PATH` | Path to host `tls.cert` (preferred) |
| `LND_TLS_SKIP_VERIFY` | `true` only as a last-resort dev override |

Optional: `LND_MACAROON_PATH` instead of hex; `LND_TLS_CERT` PEM instead of a file.

## Bitnob

Bitnob is **payout-only** (local currency withdrawals). It is never used for sales invoices.
