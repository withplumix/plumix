import type { OpenAPI } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";

import type { AppContext } from "../context/app.js";
import type { RestPrincipal } from "./principal.js";
import { jsonResponse, notFound, unauthorized } from "../runtime/http.js";
import { generateOpenApiDocument } from "./openapi.js";
import { resolveRestPrincipal } from "./principal.js";
import { restRouter } from "./router.js";

/**
 * Dispatches a request against the REST surface. The dispatcher branch hands
 * over once `config.api` is enabled, so this never runs on a disabled or
 * cold-start path.
 */
export type RestDispatch = (ctx: AppContext) => Promise<Response>;

const API_V1_PREFIX = "/_plumix/api/v1";
const SPEC_PATH = `${API_V1_PREFIX}/openapi.json`;

export function buildRestDispatcher(): RestDispatch {
  const handler = new OpenAPIHandler(restRouter);
  // Generated once per isolate, on first request for the spec.
  let spec: Promise<OpenAPI.Document> | undefined;
  return async (ctx) => {
    const url = new URL(ctx.request.url);
    if (url.pathname === SPEC_PATH) {
      return jsonResponse(await (spec ??= generateOpenApiDocument()));
    }

    const principal: RestPrincipal = await resolveRestPrincipal(ctx);
    if (principal.kind === "unauthorized") return unauthorized();

    const result = await handler.handle(ctx.request, {
      prefix: API_V1_PREFIX,
      context: principal.ctx,
    });
    const response = result.matched
      ? result.response
      : notFound("rest-route-not-found");

    // PAT-authed reads may include non-public content: never cache them.
    return principal.kind === "authed" ? markNonCacheable(response) : response;
  };
}

function markNonCacheable(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
