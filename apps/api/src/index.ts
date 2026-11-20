import Fastify from "fastify"; // Vercel Fastify detector requires this import in the entry file
import { buildServer } from "./create-app.js";
import { env } from "./env.js";
import { pollOpenPayments } from "./payments.js";
import { assertTestnet, lightningProviderLabel } from "./lightning.js";

void Fastify; // keep the import live for the detector / bundler

const app = await buildServer();

// Vercel Fluid / serverless: export the Fastify instance; do not bind a port on Vercel.
export default app;

async function startLocal() {
  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`Flow API at ${env.apiUrl}`);
  try {
    await assertTestnet();
    app.log.info(`Lightning ready via ${lightningProviderLabel()}`);
  } catch (error) {
    app.log.warn(
      error instanceof Error ? error.message : error,
      "Lightning unavailable until NWC_CONNECTION_STRING (recommended) or COINOS_TOKEN or OPENNODE_API_KEY or LND_REST_URL + macaroon are set",
    );
  }
  // Always-on poller is for long-lived local/dev processes only.
  // On Vercel, payment GETs call settleFromNode / pollOpenPayments on read instead.
  setInterval(() => {
    void pollOpenPayments().catch((error) => app.log.warn(error));
  }, 4000);
}

if (!process.env.VERCEL) {
  await startLocal();
}
