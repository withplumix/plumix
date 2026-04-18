import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "./app.js";
import { hasCsrfHeader, hasMatchingOrigin } from "../auth/csrf.js";
import {
  handleInviteRegisterOptions,
  handleInviteRegisterVerify,
  handlePasskeyLoginOptions,
  handlePasskeyLoginVerify,
  handlePasskeyRegisterOptions,
  handlePasskeyRegisterVerify,
  handleSignout,
} from "../auth/passkey/routes.js";
import { forbidden, jsonResponse, methodNotAllowed, notFound } from "./http.js";

const RPC_PREFIX = "/_plumix/rpc";
const ADMIN_PREFIX = "/_plumix/admin";
const PLUMIX_PREFIX = "/_plumix/";

type RouteHandler = (ctx: AppContext, app: PlumixApp) => Promise<Response>;

const POST_AUTH_ROUTES = new Map<string, RouteHandler>([
  ["/_plumix/auth/passkey/register/options", handlePasskeyRegisterOptions],
  ["/_plumix/auth/passkey/register/verify", handlePasskeyRegisterVerify],
  ["/_plumix/auth/passkey/login/options", handlePasskeyLoginOptions],
  ["/_plumix/auth/passkey/login/verify", handlePasskeyLoginVerify],
  ["/_plumix/auth/invite/register/options", handleInviteRegisterOptions],
  ["/_plumix/auth/invite/register/verify", handleInviteRegisterVerify],
  ["/_plumix/auth/signout", (ctx) => handleSignout(ctx)],
]);

export type PlumixDispatcher = (ctx: AppContext) => Promise<Response>;

export function createPlumixDispatcher(app: PlumixApp): PlumixDispatcher {
  return async (ctx) => {
    try {
      return await route(app, ctx);
    } catch (error) {
      ctx.logger.error("dispatch_failed", {
        error,
        url: ctx.request.url,
        method: ctx.request.method,
      });
      return jsonResponse({ error: "internal_error" }, { status: 500 });
    }
  };
}

async function route(app: PlumixApp, ctx: AppContext): Promise<Response> {
  const { pathname } = new URL(ctx.request.url);

  if (pathname.startsWith(PLUMIX_PREFIX)) {
    if (!hasCsrfHeader(ctx.request)) {
      return forbidden("csrf_header_missing");
    }
    // Defense-in-depth: the custom-header check already blocks cross-origin
    // POSTs (a browser can't set X-Plumix-Request without a CORS preflight,
    // which Plumix never grants). If an Origin header is present anyway,
    // reject mismatches too — protects against a future misconfigured CORS
    // layer or an intermediate that strips/forwards headers loosely.
    if (
      ctx.request.headers.has("origin") &&
      !hasMatchingOrigin(ctx.request, { allowed: [app.origin] })
    ) {
      return forbidden("csrf_origin_mismatch");
    }
  }

  if (pathname === RPC_PREFIX || pathname.startsWith(`${RPC_PREFIX}/`)) {
    const result = await app.rpcHandler.handle(ctx.request, {
      prefix: RPC_PREFIX,
      context: ctx,
    });
    return result.matched
      ? result.response
      : notFound("rpc-procedure-not-found");
  }

  const authHandler = POST_AUTH_ROUTES.get(pathname);
  if (authHandler) {
    if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
    return authHandler(ctx, app);
  }

  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    return notFound("admin-not-available");
  }

  if (pathname.startsWith(PLUMIX_PREFIX)) {
    return notFound("unknown-plumix-route");
  }

  return new Response("<h1>Plumix</h1>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
