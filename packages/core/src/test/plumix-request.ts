/**
 * The loopback origin a dev-only surface has to be reached over to be served
 * (#2007). Tests that exercise the debug bar, its request history, the dev
 * error page or an `auth: "development"` route dispatch against this; anything
 * still on `https://cms.example` is asserting the off-loopback side of the gate.
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
