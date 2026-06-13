import type { OpenAPI } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";

import type { AppContext } from "../context/app.js";
import { jsonResponse, notFound } from "../runtime/http.js";
import { generateOpenApiDocument } from "./openapi.js";
import { withPublicPrincipal } from "./principal.js";
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
    // Anonymous reads resolve to a read-only public principal; the entry
    // services then clamp to published + hide-existence with no REST-specific
    // status logic.
    const publicCtx = withPublicPrincipal(ctx);
    const result = await handler.handle(ctx.request, {
      prefix: API_V1_PREFIX,
      context: publicCtx,
    });
    return result.matched ? result.response : notFound("rest-route-not-found");
  };
}
