# Flow

Lightning commerce. Buyers pay a Flow invoice on Flow’s Lightning backend. Merchants withdraw Bitcoin from that backend, or local currency through Bitnob (withdrawals only — never for sales invoices).

## Run

1. Copy `.env.example` to `.env`.
2. `docker compose up -d` — starts **Postgres only**. No local bitcoind/LND (avoids multi-GB IBD on metered connections).
3. Configure **NWC** (Nostr Wallet Connect) — see below.
4. `pnpm install`
5. `pnpm db:generate`
6. `pnpm db:push`
7. `pnpm db:seed` — demo merchant for judges (idempotent)
8. `pnpm dev`

Web: http://localhost:3000 · API: http://localhost:4000

The API refuses Lightning work until a backend is configured. It never invents invoices.

## Judge demo

Use these fixed credentials on production or local after seeding:

| | |
| --- | --- |
| **URL** | https://flow.rpay.space · local: http://localhost:3000 |
| **Email** | `demo@flow.rpay.space` |
| **Password** | `FlowDemo2026!` |

Shop: **Flow Demo Shop** — three sample products (prices in sats) plus pay link `/pay/link/flow-demo`.

**Notes for judges**

- Lightning uses **testnet / NWC demo sats**, not mainnet. Do not expect real on-chain value.
- Local currency withdraw may show **unavailable** if payout credentials are not configured.
- Re-seed anytime: `pnpm db:seed` (upserts by email; safe to re-run). For production Neon, point `DATABASE_URL` at that DB first (never commit the URL).

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

## Bitnob (local currency withdrawals)

Bitnob Business API is **payout-only**. It is never used for sales invoices (sales stay on NWC / Lightning).

### Current status / limitation

Local payouts stay **disabled** until `GET /api/whoami` succeeds with `environment=sandbox` using your loaded credentials.

If whoami returns **401 Invalid client credentials**:

1. Open [app.bitnob.com](https://app.bitnob.com) → **Settings → API Keys** → create a **sandbox** key.
2. Map fields exactly:
   - `BITNOB_CLIENT_ID` = Client ID (dashboard may label this `apiKey`)
   - `BITNOB_CLIENT_SECRET` = Client Secret (dashboard may label this `secretKey`)
   - Do **not** put the webhook signing secret in `BITNOB_CLIENT_SECRET`
3. `BITNOB_WEBHOOK_SECRET` = webhook signing secret from **Settings → Webhooks** (different from the API secret)
4. Restart the API and hit Dashboard → Withdraw → Local currency (or `GET /dashboard/withdrawals/local/status`)

Until whoami succeeds, quote/confirm return clear `503` (`payouts_unconfigured` / `invalid_credentials`). Swapping ID↔secret was tried against the live API and still 401’d with the keys currently in local `.env` — those credentials need to be re-created in the dashboard.

### Sandbox payout sequence (implemented)

1. **Quote** — `source=onchain`, `chain=LIGHTNING`, `amount_in_base_units=<sats>`
2. **Initialize** — beneficiary + `callback_url` → funding Lightning invoice
3. **Fund** — Flow pays that invoice from custody (`payInvoice` / NWC when configured)
4. **Finalize** — after funding is submitted
5. **Webhook** — `POST {API_URL}/webhooks/bitnob` verified with HMAC-SHA512; marks withdrawal completed/failed

There is **no** documented Bitnob “simulate payout deposit” for onchain LIGHTNING quotes (VA simulate-deposit is unrelated). Sandbox end-to-end funding therefore needs a Lightning wallet that can pay the funding invoice. NWC faucet wallets often cannot.

`API_URL` must be public **HTTPS** for webhooks (Vercel API URL, or a tunnel like ngrok/cloudflared locally).

## Deploy (GitHub + Vercel)

Monorepo layout:

| Project | Root directory | Role |
| --- | --- | --- |
| `flow-rpay-api` | `apps/api` | Fastify on Vercel Fluid / serverless (`export default` app) |
| `flow-rpay-web` | `apps/web` | Next.js; rewrites `/api/*` → API via `FLOW_SERVER_API_URL` |

Payment settlement on Vercel does **not** use a long-lived poller. Checkout/payment GETs call `settleFromNode` / `pollOpenPayments` on read.

### Required Vercel env (both projects unless noted)

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | API (and generate) | **Required for prod.** Neon / Postgres — never commit. Localhost-only in repo `.env*` — do not invent credentials. |
| `ENCRYPTION_KEY` | API | 64 hex chars (32 bytes) |
| `NWC_CONNECTION_STRING` | API | Lightning backend |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | API | Assistant; missing → clear 503, payments still work |
| `WEB_ORIGIN` | API | Production web origin (cookie CORS) |
| `APP_URL` | API | Public web URL (storefront / pay links) |
| `API_URL` | API | Public **HTTPS** API origin (webhooks) |
| `NEXT_PUBLIC_API_URL` | Web | Use `/api` for same-origin proxy |
| `FLOW_SERVER_API_URL` | Web (server) | Internal/public API origin for Next rewrites |
| `BITNOB_*` | API | Only after whoami succeeds |

### Blocker: Neon / `DATABASE_URL`

Production API needs a hosted Postgres URL. Adding Neon via CLI is blocked until the project owner accepts Marketplace terms:

1. Open [Accept Neon terms](https://vercel.com/abdu-shakurs-projects/~/integrations/accept-terms/neon?source=cli)
2. Then: `vercel --cwd apps/api integration add neon --name flow-rpay-db --plan free_v3 --no-claim -m region=iad1 -m auth=false --environment production --environment preview --environment development`
3. Confirm `DATABASE_URL` appears under `flow-rpay-api` (`vercel env ls --cwd apps/api`) and redeploy the API.

Until then, API routes that touch Prisma will fail at runtime even if the deploy builds. `/health` still responds and reports `databaseConfigured: false`.

### Deployment protection

`flow-rpay-api` must be **public** (SSO/Standard Protection off) so web rewrites, wallets, and webhooks can reach `*.vercel.app` and production domains. Prefers: `vercel project protection disable flow-rpay-api --sso`. Keep preview-only protection on web if desired; use Automation Bypass (`x-vercel-protection-bypass`) for CI against protected preview URLs.

### CLI sketch

```bash
# API
cd apps/api
vercel link --yes --project flow-rpay-api
# After Neon terms: vercel integration add neon … (see above) OR vercel env add DATABASE_URL production
# …other secrets already set via vercel env add…
vercel deploy --prod

# Web
cd ../web
vercel link --yes --project flow-rpay-web
vercel env add NEXT_PUBLIC_API_URL production --type config   # value: /api
vercel env add FLOW_SERVER_API_URL production --type config   # value: https://<api-deployment>
vercel deploy --prod
```

Never commit `.env`, wallet passwords, macaroons, or TLS material. `.gitignore` already excludes them.
