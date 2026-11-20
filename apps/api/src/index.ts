import { buildServer } from "./server.js";
import { env } from "./env.js";
import { pollOpenPayments } from "./payments.js";
import { assertTestnet, lightningProviderLabel } from "./lightning.js";

const app = await buildServer();

// Fastify zero-config on Vercel: listen() is intercepted; export keeps Fluid entry clear.
export default app;

await app.listen({ port: env.port, host: "0.0.0.0" });
app.log.info(`Flow API at ${env.apiUrl}`);

if (!process.env.VERCEL) {
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
