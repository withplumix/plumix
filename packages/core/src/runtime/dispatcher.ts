import type { AppContext } from "../context/app.js";
import type { RegisteredRawRoute } from "../plugin/manifest.js";
import type { PlumixApp } from "./app.js";
import { readSessionCookie } from "../auth/cookies.js";
import { hasCsrfHeader, hasMatchingOrigin } from "../auth/csrf.js";
import {
  handleOAuthCallback,
  handleOAuthStart,
  parseOAuthPath,
} from "../auth/oauth/routes.js";
import {
  handleInviteRegisterOptions,
  handleInviteRegisterVerify,
  handlePasskeyLoginOptions,
  handlePasskeyLoginVerify,
  handlePasskeyRegisterOptions,
  handlePasskeyRegisterVerify,
  handleSignout,
} from "../auth/passkey/routes.js";
import { validateSession } from "../auth/sessions.js";
import { withUser } from "../context/app.js";
import { matchRoute } from "../route/match.js";
import { resolvePublicRoute } from "../route/resolve.js";
import { forbidden, jsonResponse, methodNotAllowed, notFound } from "./http.js";

const RPC_PREFIX = "/_plumix/rpc";
const ADMIN_PREFIX = "/_plumix/admin";
const AUTH_PREFIX = "/_plumix/auth/";
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

function enforcePlumixCsrf(app: PlumixApp, ctx: AppContext): Response | null {
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
  return null;
}

async function route(app: PlumixApp, ctx: AppContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const { pathname } = url;

  if (pathname.startsWith(PLUMIX_PREFIX)) {
    const csrfFailure = enforcePlumixCsrf(app, ctx);
    if (csrfFailure) return csrfFailure;
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

  // OAuth endpoints are top-level GET navigations from the browser, so they
  // can't carry the X-Plumix-Request header. The CSRF gate already lets
  // safe methods through, and the state token is the per-request CSRF
  // anchor for the callback. Match the path *and* enforce GET here.
  const oauth = parseOAuthPath(pathname);
  if (oauth) {
    if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
    return oauth.tail === "start"
      ? handleOAuthStart(ctx, app, oauth.params.providerKey)
      : handleOAuthCallback(ctx, app, oauth.params.providerKey);
  }

  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    return serveAdmin(ctx);
  }

  if (pathname.startsWith(PLUMIX_PREFIX) && !pathname.startsWith(AUTH_PREFIX)) {
    const pluginMatch = matchPluginRawRoute(
      app.rawRoutes,
      pathname,
      ctx.request.method,
    );
    if (pluginMatch !== null) {
      return dispatchPluginRawRoute(pluginMatch.route, ctx, app);
    }
    // Method-allowed-but-path-unmatched falls through to the 404 below;
    // a plugin that registered only GET wouldn't want POST to 405 here
    // because the path itself is unrecognised from the dispatcher's pov.
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

interface PluginRawRouteMatch {
  readonly route: RegisteredRawRoute;
}

export function matchPluginRawRoute(
  routes: readonly RegisteredRawRoute[],
  pathname: string,
  method: string,
): PluginRawRouteMatch | null {
  const methodUpper = method.toUpperCase();
  for (const route of routes) {
    if (route.method !== "*" && route.method !== methodUpper) continue;
    const pluginPrefix = `/_plumix/${route.pluginId}`;
    if (pathname !== pluginPrefix && !pathname.startsWith(`${pluginPrefix}/`)) {
      continue;
    }
    const localPath =
      pathname === pluginPrefix ? "/" : pathname.slice(pluginPrefix.length);
    if (route.path.endsWith("/*")) {
      const prefix = route.path.slice(0, -1);
      if (localPath === prefix.slice(0, -1) || localPath.startsWith(prefix)) {
        return { route };
      }
      continue;
    }
    if (localPath === route.path) return { route };
  }
  return null;
}

async function dispatchPluginRawRoute(
  route: RegisteredRawRoute,
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const gate = route.auth;
  if (gate === "public") {
    return route.handler(ctx.request, ctx);
  }

  const token = readSessionCookie(ctx.request);
  if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
  const validated = await validateSession(ctx.db, token);
  if (!validated)
    return jsonResponse({ error: "unauthorized" }, { status: 401 });

  const { id, email, role } = validated.user;
  const authedCtx = withUser(ctx, { id, email, role });

  if (gate === "authenticated") {
    return route.handler(authedCtx.request, authedCtx);
  }
  const capability = gate.capability;
  if (!app.capabilityResolver.hasCapability(role, capability)) {
    return jsonResponse({ error: "forbidden", capability }, { status: 403 });
  }
  return route.handler(authedCtx.request, authedCtx);
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
  // Hand the client its index.html so it can resolve the path. Fetch
  // the prefix URL itself (which the assets binding maps to index.html
  // with a 200) rather than `${PREFIX}/index.html` — the latter
  // triggers a redirect to the trailing-slash version under
  // `not_found_handling: "single-page-application"` and miniflare's
  // local emulation.
  const indexUrl = new URL(`${ADMIN_PREFIX}/`, ctx.request.url);
  return ctx.assets.fetch(new Request(indexUrl, ctx.request));
}
