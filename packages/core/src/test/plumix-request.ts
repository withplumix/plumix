/**
 * The loopback origin dev-only surfaces must be reached over;
 * `https://cms.example` tests assert the off-loopback side of the gate.
 */
export const DEV_ORIGIN = "http://localhost:5173";

export function plumixRequest(path: string, init: RequestInit = {}): Request {
  const url = path.startsWith("http") ? path : `https://cms.example${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("x-plumix-request")) {
    headers.set("x-plumix-request", "1");
  }
  return new Request(url, { ...init, headers });
}
