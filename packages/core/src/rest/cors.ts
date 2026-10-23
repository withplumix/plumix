import type { ApiCorsConfig } from "../config.js";
import type { RegisteredRestResource } from "../plugin/manifest.js";
import { withHeaders } from "../runtime/contract/http.js";
import { isParam } from "./rest-routes.js";

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

/**
 * An allowlist must `Vary: origin` even on a miss, or a shared cache could
 * serve a no-CORS entry to an allowed origin.
 */
export function isOriginDependent(cors: ApiCorsConfig | undefined): boolean {
  return Array.isArray(cors?.origins);
}

/**
 * CORS for anonymous requests only. No `Access-Control-Allow-Credentials` is ever
 * set — the surface is bearer/anonymous, never cookie-authed, so credentialed
 * CORS would only invite a PAT-in-browser-JS footgun.
 */
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

/** The `Access-Control-Allow-Methods` a preflight answers for a request path. */
type PreflightMethods = (path: string) => string;

const BASE_METHODS = "GET, OPTIONS";

function matchesTemplate(template: readonly string[], path: string): boolean {
  const segments = path.split("/");
  return (
    segments.length === template.length &&
    template.every((segment, i) => isParam(segment) || segment === segments[i])
  );
}

/**
 * Lists only `auth: "public"` methods: the preflight allows `authorization`,
 * so listing a token-authed one would invite a token into browser JS.
 */
export function buildPreflightMethods(
  resources: readonly RegisteredRestResource[],
  prefix: string,
): PreflightMethods {
  const publicResources = resources
    .filter(
      (resource) => resource.auth === "public" && resource.method !== "GET",
    )
    .map((resource) => ({
      method: resource.method,
      template: `${prefix}${resource.path}`.split("/"),
    }));
  return (path) => {
    const methods = publicResources
      .filter((resource) => matchesTemplate(resource.template, path))
      .map((resource) => resource.method);
    return [BASE_METHODS, ...methods].join(", ");
  };
}

/**
 * Preflight carries no credentials, so it gates on origins alone; the
 * token-authed response stays CORS-free, keeping tokens server-to-server.
 */
export function preflightResponse(
  request: Request,
  allowOrigin: string | null,
  methods: string,
): Response {
  if (allowOrigin === null) return new Response(null, { status: 403 });
  const headers = corsHeaders(allowOrigin);
  headers.set("access-control-allow-methods", methods);
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ??
      "authorization, content-type",
  );
  headers.set("access-control-max-age", "600");
  return new Response(null, { status: 204, headers });
}
