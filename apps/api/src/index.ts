import { buildServer } from "./server.js";
import { env } from "./env.js";
import { pollOpenPayments } from "./payments.js";
import { assertTestnet, lightningProviderLabel } from "./lightning.js";

const app = await buildServer();

app.listen({ port: env.port, host: "0.0.0.0" }).then(async () => {
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
  if (!process.env.VERCEL) {
    setInterval(() => {
      void pollOpenPayments().catch((error) => app.log.warn(error));
    }, 4000);
  }
});
