import type { ApiCorsConfig } from "../config.js";
import { withHeaders } from "../runtime/contract/http.js";

/**
 * Default-closed: null without config. An array echoes the request's origin
 * only if listed.
 */
export function resolveAllowedOrigin(
  cors: ApiCorsConfig | undefined,
  requestOrigin: string | null,
): string | null {
  if (!cors?.origins) return null;
  if (cors.origins === "*") return "*";
  if (requestOrigin && cors.origins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}

// An allowlist must `Vary: origin` even on a miss, or a shared cache could
// serve a no-CORS entry to an allowed origin.
export function isOriginDependent(cors: ApiCorsConfig | undefined): boolean {
  return Array.isArray(cors?.origins);
}

// CORS for anonymous reads only. No `Access-Control-Allow-Credentials` is ever
// set — the surface is bearer/anonymous, never cookie-authed, so credentialed
// CORS would only invite a PAT-in-browser-JS footgun.
function corsHeaders(allowOrigin: string): Headers {
  const headers = new Headers({ "access-control-allow-origin": allowOrigin });
  if (allowOrigin !== "*") headers.append("vary", "origin");
  return headers;
}

export function withCors(
  response: Response,
  allowOrigin: string | null,
  varyByOrigin: boolean,
): Response {
  if (!allowOrigin && !varyByOrigin) return response;
  return withHeaders(response, (headers) => {
    if (allowOrigin) {
      headers.append("access-control-allow-origin", allowOrigin);
    }
    if (varyByOrigin) headers.append("vary", "origin");
  });
}

// Preflight carries no credentials, so it gates on origins alone; the
// token-authed response stays CORS-free, keeping tokens server-to-server.
export function preflightResponse(
  request: Request,
  allowOrigin: string | null,
): Response {
  if (allowOrigin === null) return new Response(null, { status: 403 });
  const headers = corsHeaders(allowOrigin);
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ??
      "authorization, content-type",
  );
  headers.set("access-control-max-age", "600");
  return new Response(null, { status: 204, headers });
}
