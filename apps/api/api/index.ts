/**
 * Classic Vercel Serverless entry (@vercel/node).
 * Wraps the Fastify app as a Node (req, res) handler.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "../src/create-app.js";

type App = Awaited<ReturnType<typeof buildServer>>;

let appPromise: Promise<App> | null = null;

function getApp(): Promise<App> {
  if (!appPromise) {
    appPromise = buildServer()
      .then(async (app) => {
        await app.ready();
        return app;
      })
      .catch((error) => {
        appPromise = null;
        throw error;
      });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: { code: "boot_failed", message } }));
    }
  }
}
