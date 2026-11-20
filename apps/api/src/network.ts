/**
 * Active Lightning network label for health, banners, and API payloads.
 * NWC → testnet (faucet/demo); CoinOS → mainnet; OpenNode → testnet; LND → detected / LIGHTNING_NETWORK.
 */
import { coinosConfigured, lndConfigured, nwcConfigured, opennodeConfigured } from "./env.js";

export type LightningNetwork = "regtest" | "testnet" | "mainnet";

export function lightningNetworkFromEnv(): LightningNetwork | null {
  const raw = (process.env.LIGHTNING_NETWORK ?? "").trim().toLowerCase();
  if (raw === "regtest" || raw === "testnet" || raw === "mainnet") return raw;
  return null;
}

/** Best-effort label without calling providers (for serialize / health fallback). */
export function configuredLightningNetwork(): LightningNetwork {
  const hint = lightningNetworkFromEnv();
  if (hint) return hint;
  if (nwcConfigured()) return "testnet";
  if (coinosConfigured()) return "mainnet";
  if (opennodeConfigured()) return "testnet";
  if (lndConfigured()) return "testnet";
  return "testnet";
}

export function networkBannerCopy(network: LightningNetwork): string {
  if (nwcConfigured() && !lightningNetworkFromEnv()) {
    return "NWC test wallet. Demo / faucet sats — not real mainnet value.";
  }
  switch (network) {
    case "regtest":
      return "Regtest. Local Bitcoin — no real value.";
    case "mainnet":
      return "Mainnet. Real sats — use tiny amounts.";
    default:
      return "Testnet. Bitcoin here has no real value.";
  }
}
