import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

for (const path of [".env", "../../.env"]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1);
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optionalPath(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return resolve(repoRoot, value.trim());
}

const lndTlsSkipVerify = (process.env.LND_TLS_SKIP_VERIFY ?? "").toLowerCase() === "true";

export const env = {
  /** Empty when unset — /health still boots; Prisma routes fail until Neon URL is set. */
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  port: Number(process.env.API_PORT ?? 4000),
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  encryptionKey: Buffer.from(required("ENCRYPTION_KEY"), "hex"),
  /**
   * Optional network hint: regtest | testnet | mainnet.
   * Required mindset for local docker regtest (`LIGHTNING_NETWORK=regtest`).
   * Also drives UI banner /health when providers are not queried.
   */
  lightningNetwork: (process.env.LIGHTNING_NETWORK ?? "").trim().toLowerCase(),
  /** LND REST base — regtest default https://127.0.0.1:8081 or hosted e.g. Voltage */
  lndRestUrl: (process.env.LND_REST_URL ?? "").replace(/\/$/, ""),
  /** Hex-encoded macaroon (preferred for hosted). Overrides path when set. */
  lndMacaroonHex: (process.env.LND_MACAROON ?? "").trim(),
  lndMacaroonPath: optionalPath(process.env.LND_MACAROON_PATH),
  /** PEM contents of tls.cert (optional). Overrides path when set. */
  lndTlsCertPem: process.env.LND_TLS_CERT?.replace(/\\n/g, "\n").trim() ?? "",
  lndTlsCertPath: optionalPath(process.env.LND_TLS_CERT_PATH),
  /**
   * Dev-only: skip TLS verification when the host requires it and you have no cert.
   * Prefer downloading tls.cert from the host dashboard instead.
   */
  lndTlsSkipVerify,
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1",
  /**
   * Bitnob Business API — local-currency withdrawals only (never sales invoices).
   * Sandbox and production share https://api.bitnob.com; the CLIENT_SECRET selects
   * the environment (confirm with GET /api/whoami → data.environment).
   */
  bitnobClientId: process.env.BITNOB_CLIENT_ID ?? "",
  bitnobClientSecret: process.env.BITNOB_CLIENT_SECRET ?? "",
  bitnobWebhookSecret: process.env.BITNOB_WEBHOOK_SECRET ?? "",
  bitnobBaseUrl: process.env.BITNOB_BASE_URL ?? "https://api.bitnob.com",
  /**
   * Nostr Wallet Connect connection string — preferred (hackathon lists NWC).
   * Faucet: POST https://faucet.nwc.dev?balance=10000 → paste nostr+walletconnect://...
   * Playground: https://sandbox.albylabs.com/ · Spec: https://nwc.dev
   */
  nwcConnectionString: (process.env.NWC_CONNECTION_STRING ?? "").trim(),
  /**
   * CoinOS bearer token — optional fallback (instant signup, no invite).
   * Signup: https://coinos.io or POST /api/register — see README.
   * Mainnet custodial; use small amounts for demos.
   */
  coinosToken: (process.env.COINOS_TOKEN ?? "").trim(),
  coinosApiUrl: (process.env.COINOS_API_URL ?? "https://coinos.io/api").replace(/\/$/, ""),
  /**
   * OpenNode development (testnet) API key — optional; signup may require approval.
   * Prefer NWC_CONNECTION_STRING (or COINOS_TOKEN) when you need something that works today.
   */
  opennodeApiKey: (process.env.OPENNODE_API_KEY ?? "").trim(),
  /** Default is the free testnet sandbox. Do not point at production for Flow. */
  opennodeApiUrl: (process.env.OPENNODE_API_URL ?? "https://dev-api.opennode.com").replace(/\/$/, ""),
};

if (env.encryptionKey.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be 32 bytes of hex");
}

export function nwcConfigured(): boolean {
  return Boolean(env.nwcConnectionString);
}

export function coinosConfigured(): boolean {
  return Boolean(env.coinosToken);
}

export function opennodeConfigured(): boolean {
  return Boolean(env.opennodeApiKey);
}

export function lndConfigured(): boolean {
  if (!env.lndRestUrl) return false;
  if (env.lndMacaroonHex) return true;
  if (env.lndMacaroonPath && existsSync(env.lndMacaroonPath)) return true;
  return false;
}

/** NWC wins, then CoinOS, OpenNode, LND. */
export function lightningConfigured(): boolean {
  return nwcConfigured() || coinosConfigured() || opennodeConfigured() || lndConfigured();
}

export function readOptional(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}
