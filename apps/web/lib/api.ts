/**
 * Browser API base.
 * - Local default: http://localhost:4000
 * - Vercel same-origin proxy: set NEXT_PUBLIC_API_URL=/api (rewrites to FLOW_SERVER_API_URL)
 */
export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? "Request failed");
  return json;
}
