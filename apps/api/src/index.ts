import Fastify from "fastify"; // Vercel Fastify detector requires this import in the entry file
import { env } from "./env.js";
import { pollOpenPayments } from "./payments.js";
import { assertTestnet, lightningProviderLabel } from "./lightning.js";

void Fastify;

async function boot() {
  try {
    const { buildServer } = await import("./create-app.js");
    return await buildServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = Fastify({ logger: true });
    fallback.get("/health", async () => ({
      ok: false,
      databaseConfigured: Boolean(env.databaseUrl),
      bootError: message,
    }));
    fallback.setErrorHandler((_err, _req, reply) =>
      reply.status(503).send({ error: { code: "boot_failed", message } }),
    );
    return fallback;
  }
}

const app = await boot();
export default app;

if (process.env.VERCEL) {
  // Do not await listen on Vercel — awaiting can hang module evaluation.
  // Fluid wires the default export; fire-and-forget listen matches the platform example.
  void app.listen({ port: Number(process.env.PORT) || env.port, host: "0.0.0.0" });
} else {
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
  setInterval(() => {
    void pollOpenPayments().catch((error) => app.log.warn(error));
  }, 4000);
}
