/** The Nexus backend (B2C-Backend): device lookups, AI matching, recognition feedback. */
// `?.`: also imported outside Vite (training/gen-dataset.ts runs under tsx, without import.meta.env).
export const API = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// Set by the auth provider when Auth0 is configured; without it calls go out without a token.
let tokenGetter: (() => Promise<string | undefined>) | null = null;
export function setTokenGetter(getter: typeof tokenGetter) {
  tokenGetter = getter;
}

/** fetch() on the backend, with the user's Auth0 token when there is one. */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await tokenGetter?.().catch(() => undefined);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...init, headers });
}

/** POST a JSON body, giving up after `timeoutMs`. */
export function postJson(path: string, body: unknown, timeoutMs = 30_000): Promise<Response> {
  return backendFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
