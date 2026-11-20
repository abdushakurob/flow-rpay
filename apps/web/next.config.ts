import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  async rewrites() {
    const apiOrigin = process.env.FLOW_SERVER_API_URL?.replace(/\/$/, "");
    return apiOrigin ? [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }] : [];
  },
};

export default nextConfig;
