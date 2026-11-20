/**
 * Lightning facade: NWC (preferred) → CoinOS → OpenNode → hosted LND REST.
 */
import { env, coinosConfigured, lightningConfigured, nwcConfigured, opennodeConfigured } from "./env.js";
import { ApiError } from "./errors.js";
import * as coinos from "./coinos.js";
import * as lnd from "./lnd.js";
import * as nwc from "./nwc.js";
import * as opennode from "./opennode.js";
import { configuredLightningNetwork, type LightningNetwork } from "./network.js";

export type { LightningNetwork };

export type InvoiceLookup = {
  r_hash?: string;
  payment_request?: string;
  settled?: boolean;
  state?: string;
  r_preimage?: string;
  creation_date?: string;
  expiry?: string;
  value?: string;
  /** True when a custodial/NWC provider marked the charge paid without exposing a usable preimage. */
  custodialSettled?: boolean;
};

function useNwc(): boolean {
  return nwcConfigured();
}

function useCoinos(): boolean {
  return !useNwc() && coinosConfigured();
}

function useOpenNode(): boolean {
  return !useNwc() && !useCoinos() && opennodeConfigured();
}

export { lightningConfigured };

function unconfiguredMessage(): string {
  return "Lightning is not configured. Set NWC_CONNECTION_STRING (recommended) or COINOS_TOKEN or OPENNODE_API_KEY or LND_REST_URL + LND_MACAROON";
}

export async function assertTestnet(): Promise<void> {
  if (!lightningConfigured()) {
    throw new ApiError(503, "lightning_unconfigured", unconfiguredMessage());
  }
  if (useNwc()) {
    await nwc.assertNwcReady();
    return;
  }
  if (useCoinos()) {
    // CoinOS is mainnet custodial — intentional; verified by auth round-trip.
    await coinos.assertCoinosReady();
    return;
  }
  if (useOpenNode()) {
    await opennode.assertOpenNodeTestnet();
    return;
  }
  await lnd.assertTestnet();
}

export async function assertLightningReady(): Promise<{ provider: string; network: LightningNetwork; [key: string]: unknown }> {
  if (!lightningConfigured()) {
    throw new ApiError(503, "lightning_unconfigured", unconfiguredMessage());
  }
  if (useNwc()) {
    const info = await nwc.assertNwcReady();
    return { provider: "nwc", network: info.network, alias: info.alias, balanceSats: info.balanceSats };
  }
  if (useCoinos()) {
    const me = await coinos.assertCoinosReady();
    return { provider: "coinos", network: "mainnet", username: me.username };
  }
  if (useOpenNode()) {
    await opennode.assertOpenNodeReady();
    return { provider: "opennode", network: "testnet" };
  }
  const info = await lnd.assertLightningReady();
  return { provider: "lnd", network: info.flowNetwork, ...info };
}

/** Network label for API/UI — prefers live provider when cheap; else env/config hint. */
export function activeLightningNetwork(): LightningNetwork {
  return configuredLightningNetwork();
}

export async function addInvoice(amountSats: string, memo: string) {
  if (useNwc()) return nwc.addNwcInvoice(amountSats, memo);
  if (useCoinos()) return coinos.addCoinosInvoice(amountSats, memo);
  if (useOpenNode()) return opennode.addOpenNodeInvoice(amountSats, memo);
  return lnd.addInvoice(amountSats, memo);
}

export async function lookupInvoice(paymentHashOrChargeId: string): Promise<InvoiceLookup> {
  if (useNwc()) return nwc.lookupNwcInvoice(paymentHashOrChargeId);
  if (useCoinos()) return coinos.lookupCoinosInvoice(paymentHashOrChargeId);
  if (useOpenNode()) return opennode.lookupOpenNodeInvoice(paymentHashOrChargeId);
  return lnd.lookupInvoice(paymentHashOrChargeId);
}

export async function payInvoice(bolt11: string) {
  if (useNwc()) return nwc.payNwcInvoice(bolt11);
  if (useCoinos()) return coinos.payCoinosInvoice(bolt11);
  if (useOpenNode()) return opennode.payOpenNodeInvoice(bolt11);
  return lnd.payInvoice(bolt11);
}

export async function sendCoins(address: string, amountSats: string) {
  if (useNwc()) return nwc.sendNwcCoins(address, amountSats);
  if (useCoinos()) return coinos.sendCoinosCoins(address, amountSats);
  if (useOpenNode()) return opennode.sendOpenNodeCoins(address, amountSats);
  return lnd.sendCoins(address, amountSats);
}

export function lightningProviderLabel(): string {
  if (useNwc()) return "NWC (Nostr Wallet Connect)";
  if (useCoinos()) return `CoinOS (${env.coinosApiUrl})`;
  if (useOpenNode()) return `OpenNode (${env.opennodeApiUrl})`;
  if (env.lndRestUrl) return `LND REST (${env.lndRestUrl})`;
  return "unconfigured";
}
