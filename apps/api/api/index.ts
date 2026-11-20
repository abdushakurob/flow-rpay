/**
 * Classic Vercel Serverless entry (framework: other).
 * Wraps the Fastify app as a Node (req, res) listener — no Fluid auto-detect.
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
  const app = await getApp();
  app.server.emit("request", req, res);
}
