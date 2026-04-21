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
import { matchRoute } from "../route/match.js";
import { resolvePublicRoute } from "../route/resolve.js";
import { forbidden, jsonResponse, methodNotAllowed, notFound } from "./http.js";

const RPC_PREFIX = "/_plumix/rpc";
const ADMIN_PREFIX = "/_plumix/admin";
const PLUMIX_PREFIX = "/_plumix/";

// Filenames look like `index.html`, `chunk-abc.js`, `fonts/g.woff2` — paths
// with a dot-suffix after the last slash. Deep-link SPA routes never match.
const ASSET_LIKE = /\.[^/]+$/;

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
  const url = new URL(ctx.request.url);
  const { pathname } = url;

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
    return serveAdmin(ctx);
  }

  if (pathname.startsWith(PLUMIX_PREFIX)) {
    return notFound("unknown-plumix-route");
  }

  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const match = matchRoute(url, app.routeMap);
  if (match === null) return notFound("public-route-not-found");
  return resolvePublicRoute(ctx, match);
}

async function serveAdmin(ctx: AppContext): Promise<Response> {
  // Admin is a static SPA — only GET/HEAD are meaningful. Reject everything
  // else here rather than forward to env.ASSETS, whose behavior on non-GET
  // methods is unspecified and platform-dependent.
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }
  if (ctx.assets === undefined) {
    return notFound("admin-not-available");
  }
  const { pathname } = new URL(ctx.request.url);
  // Asset-shaped paths (chunk-abc.js, missing.woff2) either hit the runtime's
  // asset layer before the worker or represent a real 404. Don't mask a
  // missing asset by returning HTML — the browser loader would choke.
  if (ASSET_LIKE.test(pathname)) {
    return notFound("admin-asset-not-found");
  }
  // SPA deep link: admin's client router owns routing past /_plumix/admin/.
  // Hand the client its index.html so it can resolve the path.
  const indexUrl = new URL(`${ADMIN_PREFIX}/index.html`, ctx.request.url);
  return ctx.assets.fetch(new Request(indexUrl, ctx.request));
}
