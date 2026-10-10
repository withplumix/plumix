import type { AccessPolicy, Segment } from "../access/policy.js";
import type { RequestAuthenticator } from "../auth/authenticator.js";
import type * as AuthFlowRoutes from "../auth/flow-routes.js";
import type { AppContext } from "../context/app-context.js";
import type { RegisteredRawRoute } from "../plugin/manifest.js";
import type { ContentRoute, PublicRouteMatch } from "../route/index.js";
import type { PlumixApp } from "./app.js";
import { resolveCapability } from "../access/contract/capability.js";
import { canAccessAdmin } from "../access/contract/rbac.js";
import { PRIVATE_SEGMENT } from "../access/contract/segments.js";
import { gateToResponse, policyForMatch } from "../access/gate.js";
import { resolveAccess } from "../access/policy.js";
import {
  authenticateTraced,
  requestHasSession,
  tokenScopesOf,
} from "../auth/authenticator.js";
import { resolveLoginPath } from "../auth/config.js";
import {
  hasCsrfHeader,
  hasMatchingOrigin,
  isLoopbackOrigin,
} from "../auth/csrf.js";
import { parseOAuthPath } from "../auth/oauth/match.js";
import { withUser } from "../auth/with-user.js";
import { stripBasePath, withBasePath } from "../base-path.js";
import { declaredPageTags } from "../cdn/contract/page-tags.js";
import {
  requestCarriesEphemeralGrant,
  requestIsPrivileged,
} from "../cdn/decision.js";
import { flushPurgeTags } from "../cdn/purge.js";
import { readThrough, readThroughRoute } from "../cdn/read-through.js";
import { pageTags } from "../cdn/tags.js";
import { interfaceEnabled } from "../config.js";
import { requestStore } from "../context/stores.js";
import { devErrorResponse } from "../dev/server/respond.js";
import { isTrustedDevRequest } from "../dev/trust.js";
import { resolveLocale } from "../i18n/resolve-locale.js";
import {
  listedEntryTypeNames,
  termPageEntryTypeNames,
} from "../plugin/registry.js";
import {
  cacheableAssetNotFound,
  renderErrorThroughTheme,
  routePublicRequest,
  STATIC_ASSET_EXT,
} from "../route/index.js";
import {
  renderIsPersonal,
  trackPrincipalReads,
} from "../route/render/personal-render.js";
import {
  injectAdminBaseHref,
  rewriteAdminShellLangDir,
} from "./admin-shell.js";
import {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFound,
  redirect,
  withNoStore,
} from "./contract/http.js";
import { loadUserForPublicRequest } from "./load-user-for-public-request.js";
import { deliverTelemetrySnapshot } from "./telemetry-delivery.js";

const RPC_PREFIX = "/_plumix/rpc";
const ADMIN_PREFIX = "/_plumix/admin";
const AUTH_PREFIX = "/_plumix/auth/";
const PLUMIX_PREFIX = "/_plumix/";
const MCP_PATH = "/_plumix/mcp";
const API_PREFIX = "/_plumix/api";
/**
 * Inlined, not imported, so the eager graph touches no dev debug module. Keep
 * in step with `DEBUG_REQUESTS_PATH`.
 */
const DEBUG_REQUESTS_PREFIX = "/_plumix/debug/requests";
/**
 * Core owns these ahead of plugin routes. The CSRF exemption must skip them
 * too, or a plugin id'd `rpc` could drop the header gate on RPC.
 */
const CORE_PLUMIX_PREFIXES = [
  RPC_PREFIX,
  ADMIN_PREFIX,
  AUTH_PREFIX,
  DEBUG_REQUESTS_PREFIX,
];

function coreAnswersPlumixPath(pathname: string): boolean {
  return CORE_PLUMIX_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}

/**
 * Lazy so the webauthn/oslo/arctic graph stays off the public render cold
 * start.
 */
let authFlowRoutes: Promise<typeof AuthFlowRoutes> | undefined;
function loadAuthFlowRoutes(): Promise<typeof AuthFlowRoutes> {
  return (authFlowRoutes ??= import("../auth/flow-routes.js"));
}

/**
 * Filenames look like `index.html`, `chunk-abc.js`, `fonts/g.woff2` — paths
 * with a dot-suffix after the last slash. Deep-link SPA routes never match.
 */
const ASSET_LIKE = /\.[^/]+$/;

type RouteHandler = (ctx: AppContext, app: PlumixApp) => Promise<Response>;
/**
 * Maps a path to its handler accessor on the lazily-loaded module, so the map
 * itself pulls no handler code into the eager graph — only the matching paths.
 */
type AuthFlowRoute = (handlers: typeof AuthFlowRoutes) => RouteHandler;

const POST_AUTH_ROUTES = new Map<string, AuthFlowRoute>([
  [
    "/_plumix/auth/passkey/register/options",
    (h) => h.handlePasskeyRegisterOptions,
  ],
  [
    "/_plumix/auth/passkey/register/verify",
    (h) => h.handlePasskeyRegisterVerify,
  ],
  ["/_plumix/auth/passkey/login/options", (h) => h.handlePasskeyLoginOptions],
  ["/_plumix/auth/passkey/login/verify", (h) => h.handlePasskeyLoginVerify],
  [
    "/_plumix/auth/invite/register/options",
    (h) => h.handleInviteRegisterOptions,
  ],
  ["/_plumix/auth/invite/register/verify", (h) => h.handleInviteRegisterVerify],
  ["/_plumix/auth/magic-link/request", (h) => h.handleMagicLinkRequest],
  ["/_plumix/auth/device/code", (h) => h.handleDeviceCodeRequest],
  [
    "/_plumix/auth/device/token",
    (h) => (ctx) => h.handleDeviceTokenExchange(ctx),
  ],
  ["/_plumix/auth/signout", (h) => h.handleSignout],
]);

const MAGIC_LINK_VERIFY_PATH = "/_plumix/auth/magic-link/verify";
const EMAIL_CHANGE_VERIFY_PATH = "/_plumix/auth/verify-email";

export type PlumixDispatcher = (ctx: AppContext) => Promise<Response>;

export function createPlumixDispatcher(app: PlumixApp): PlumixDispatcher {
  return async (ctx) => {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await ctx.telemetry.span("dispatch", async (s) => {
        const routed = await route(app, ctx);
        s.set("http.response.status_code", routed.status);
        return routed;
      });
      flushPurgeTags(ctx);
    } catch (error) {
      ctx.logger.error("dispatch_failed", {
        error,
        url: ctx.request.url,
        method: ctx.request.method,
      });
      // These routes are machine-facing, so the dev error page goes only to a
      // client asking for HTML; `*/*` gets JSON.
      response =
        devFailureResponse(ctx, error, negotiatesHtml(ctx.request)) ??
        jsonResponse({ error: "internal_error" }, { status: 500 });
    }
    deliverTelemetrySnapshot(ctx, response.status, startedAt);
    return response;
  };
}

function enforcePlumixCsrf(
  app: PlumixApp,
  ctx: AppContext,
  pathname: string,
): Response | null {
  if (!hasCsrfHeader(ctx.request)) {
    if (!acceptsFormPost(app, ctx, pathname)) {
      return forbidden("csrf_header_missing");
    }
    // Only the Origin check remains, so it must match, not merely be absent.
    return enforceOrigin(app, ctx);
  }
  // Defense-in-depth against a misconfigured CORS layer; the header alone
  // already needs a preflight Plumix never grants.
  if (!ctx.request.headers.has("origin")) return null;
  return enforceOrigin(app, ctx);
}

/**
 * POST only, since that is all a form can send. Any headerless POST reaches the
 * table scan, so the cheap tests go first.
 */
function acceptsFormPost(
  app: PlumixApp,
  ctx: AppContext,
  pathname: string,
): boolean {
  if (ctx.request.method !== "POST") return false;
  if (coreAnswersPlumixPath(pathname)) return false;
  return (
    matchPluginRawRoute(app.rawRoutes, pathname, "POST")?.route.formPost ===
    true
  );
}

function enforceOrigin(app: PlumixApp, ctx: AppContext): Response | null {
  if (hasMatchingOrigin(ctx.request, { allowed: [ctx.origin] })) return null;
  // Same-origin is never forgery, even when app.origin differs (multi-host
  // deploys, the demo sandbox).
  if (isSameOrigin(ctx.request)) return null;
  // Vite auto-increments its dev port when taken, so the config cannot predict
  // the origin.
  if (
    process.env.PLUMIX_DEV &&
    app.dev !== undefined &&
    hasLocalhostOrigin(ctx.request)
  ) {
    return null;
  }
  return forbidden("csrf_origin_mismatch");
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function hasLocalhostOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && isLoopbackOrigin(origin);
}

/**
 * Stripped once here so every downstream handler matches root-relative paths.
 */
function stripBasePathOrReject(
  app: PlumixApp,
  ctx: AppContext,
): AppContext | Response {
  if (app.config.basePath === "") return ctx;
  const rawUrl = new URL(ctx.request.url);
  const stripped = stripBasePath(rawUrl.pathname, app.config.basePath);
  if (stripped === null) {
    // The browser's favicon probe targets the domain root, not the mount.
    return STATIC_ASSET_EXT.test(rawUrl.pathname)
      ? cacheableAssetNotFound("outside-base-path")
      : notFound("outside-base-path");
  }
  rawUrl.pathname = stripped;
  return { ...ctx, request: new Request(rawUrl, ctx.request) };
}

/**
 * Ahead of the CSRF gate: bearer-token MCP and anonymous REST are CSRF-immune.
 * Each 404s before its import when disabled.
 */
async function tryColdInterfaces(
  app: PlumixApp,
  ctx: AppContext,
  pathname: string,
): Promise<Response | null> {
  if (pathname === MCP_PATH) return withNoStore(await dispatchMcp(app, ctx));
  if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
    return withNoStore(await dispatchRest(app, ctx));
  }
  return null;
}

async function dispatchMcp(app: PlumixApp, ctx: AppContext): Promise<Response> {
  // Auto-enabled in dev so a coding agent reaches it with no config flag.
  if (
    !interfaceEnabled(app.config.mcp) &&
    (!process.env.PLUMIX_DEV || app.dev === undefined)
  ) {
    return notFound("mcp-disabled");
  }
  const handleMcpRequest = await app.loadMcpHandler();
  return handleMcpRequest(ctx);
}

async function dispatchRest(
  app: PlumixApp,
  ctx: AppContext,
): Promise<Response> {
  if (!interfaceEnabled(app.config.api)) return notFound("api-disabled");
  const handleRestRequest = await app.loadRestHandler();
  return handleRestRequest(ctx);
}

/**
 * POST only: a procedure declaring `method: "GET"` escapes oRPC's strict-GET
 * default, letting a navigable URL answer private JSON.
 */
async function dispatchRpc(app: PlumixApp, ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  const rpcHandler = await app.loadRpcHandler();
  const result = await rpcHandler.handle(ctx.request, {
    prefix: RPC_PREFIX,
    context: ctx,
  });
  return result.matched ? result.response : notFound("rpc-procedure-not-found");
}

/**
 * A `/_plumix/` path that matches nothing 404s here rather than falling through
 * to the public map.
 */
async function tryPlumixRoutes(
  app: PlumixApp,
  ctx: AppContext,
  pathname: string,
): Promise<Response | null> {
  if (pathname.startsWith(PLUMIX_PREFIX)) {
    const csrfFailure = enforcePlumixCsrf(app, ctx, pathname);
    if (csrfFailure) return csrfFailure;
  }

  // Bound so the dev object narrows for the handler.
  const dev = ctx.dev;
  if (
    process.env.PLUMIX_DEV &&
    dev !== undefined &&
    isTrustedDevRequest(ctx.request) &&
    (pathname === DEBUG_REQUESTS_PREFIX ||
      pathname.startsWith(`${DEBUG_REQUESTS_PREFIX}/`))
  ) {
    const { handleDebugRequests } = await import("../dev/history-routes.js");
    return handleDebugRequests(ctx, dev);
  }

  if (pathname === RPC_PREFIX || pathname.startsWith(`${RPC_PREFIX}/`)) {
    return withNoStore(await dispatchRpc(app, ctx));
  }

  const authRoute = POST_AUTH_ROUTES.get(pathname);
  if (authRoute) {
    if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
    const handlers = await loadAuthFlowRoutes();
    return authRoute(handlers)(ctx, app);
  }

  // Top-level GET navigations can't carry the CSRF header; the state token is
  // the callback's CSRF anchor.
  const oauth = parseOAuthPath(pathname);
  if (oauth) {
    if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
    const handlers = await loadAuthFlowRoutes();
    return oauth.tail === "start"
      ? handlers.handleOAuthStart(ctx, app, oauth.params.providerKey)
      : handlers.handleOAuthCallback(ctx, app, oauth.params.providerKey);
  }

  // Same shape: the single-use `?token=` is the CSRF anchor.
  if (pathname === MAGIC_LINK_VERIFY_PATH) {
    if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
    return (await loadAuthFlowRoutes()).handleMagicLinkVerify(ctx, app);
  }

  // Same anchor model; the link goes to the new mailbox, proving ownership.
  if (pathname === EMAIL_CHANGE_VERIFY_PATH) {
    if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
    return (await loadAuthFlowRoutes()).handleEmailChangeVerify(ctx, app);
  }

  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    return serveAdmin(ctx);
  }

  if (pathname.startsWith(PLUMIX_PREFIX) && !coreAnswersPlumixPath(pathname)) {
    const pluginMatch = matchPluginRawRoute(
      app.rawRoutes,
      pathname,
      ctx.request.method,
    );
    if (pluginMatch !== null) {
      return dispatchPluginRawRoute(pluginMatch.route, ctx);
    }
    // Method-allowed-but-path-unmatched falls through to the 404 below;
    // a plugin that registered only GET wouldn't want POST to 405 here
    // because the path itself is unrecognised from the dispatcher's pov.
  }

  if (pathname.startsWith(PLUMIX_PREFIX)) {
    return notFound(UNKNOWN_PLUMIX_ROUTE);
  }

  return null;
}

async function route(app: PlumixApp, ctx: AppContext): Promise<Response> {
  const rebased = stripBasePathOrReject(app, ctx);
  if (rebased instanceof Response) return rebased;
  ctx = rebased;

  const url = new URL(ctx.request.url);
  const { pathname } = url;

  const cold = await tryColdInterfaces(app, ctx, pathname);
  if (cold) return cold;

  const plumix = await tryPlumixRoutes(app, ctx, pathname);
  if (plumix) return plumix;

  return tryPublicRoutes(app, ctx, url);
}

/**
 * The public site. The route unit answers everything it can on its own; a
 * public route is served here, on the CDN terms it opted into.
 */
function tryPublicRoutes(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  const outcome = routePublicRequest(app, ctx, url);
  switch (outcome.kind) {
    case "response":
      return Promise.resolve(outcome.response);
    case "public-route": {
      const policy = outcome.route.route.access;
      return policy === undefined
        ? servePublicRoute(outcome.route, ctx)
        : servePoliciedPublicRoute(app, ctx, url, outcome.route, policy);
    }
    case "content":
      return dispatchPublicRoute(app, ctx, url, outcome);
  }
}

/**
 * An `anonymous` grant to a privileged request renders `private`: its render
 * can show who signed in.
 */
function segmentForAudience(ctx: AppContext, segment: Segment): Segment {
  return segment === "anonymous" &&
    requestIsPrivileged(ctx.request, ctxHasSession(ctx))
    ? PRIVATE_SEGMENT
    : segment;
}

/**
 * The CDN's privileged check must ask the site's authenticator rather than
 * sniff the cookie.
 */
function ctxHasSession(ctx: AppContext): boolean {
  return requestHasSession(ctx.authenticator, ctx.request);
}

function registeredPageCacheable(
  ctx: AppContext,
  intent: ContentRoute["intent"],
): boolean | undefined {
  switch (intent?.kind) {
    case "archiveType":
      return ctx.plugins.archiveTypes.get(intent.name)?.cacheable === true;
    case "view":
      return ctx.plugins.views.get(intent.name)?.cacheable === true;
    default:
      return undefined;
  }
}

async function dispatchPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  routed: ContentRoute,
): Promise<Response> {
  const { match, intent } = routed;
  try {
    // Early-returns for session-less traffic, so the anonymous hot path pays
    // nothing.
    ctx = await loadUserForPublicRequest(ctx);

    // After the principal loads, so a per-entry lookup shares the request memo
    // the render reuses.
    const policy = await policyForMatch(ctx, match);

    // The gate runs before any content resolves, so a gated type refuses even a
    // would-be-404 URL rather than leak which slugs exist.
    let segment: Segment;
    if (policy !== null) {
      const access = await resolveAccess(ctx, policy);
      const gated = gateToResponse(access.gate, {
        ctx,
        url,
        loginPath: resolveLoginPath(app.config.auth),
      });
      if (gated !== null) return gated;
      // A soft gate's template reads `ctx.access.gate` to serve the teaser.
      ctx.access = access;
      // A preview or editor grant is per request; its render must not outlive
      // it in the shared segment entry.
      segment = requestCarriesEphemeralGrant(ctx.request)
        ? PRIVATE_SEGMENT
        : segmentForAudience(ctx, access.segment);
    } else {
      segment = requestIsPrivileged(ctx.request, ctxHasSession(ctx))
        ? PRIVATE_SEGMENT
        : "anonymous";
    }

    // Principal reads above chose the segment; one from here on makes the
    // render personal.
    ctx = trackPrincipalReads(ctx);

    const cdn = ctx.cdn;
    // A `private` segment still goes through the read-through, which bypasses
    // internally so telemetry stays uniform.
    if (cdn === undefined) {
      return await renderPublicRoute(app, ctx, routed, segment);
    }
    return await readThrough({
      request: ctx.request,
      segment,
      intentKind: intent?.kind ?? null,
      // Resolved here so the pure decision layer stays free of the registry
      // lookup.
      registeredPageCacheable: registeredPageCacheable(ctx, intent),
      cdn,
      defer: ctx.defer,
      telemetry: ctx.telemetry,
      render: () => renderPublicRoute(app, ctx, routed, segment),
      // Segment variants share one tag set, so one publish purges them all.
      tags: () => {
        const routeTags =
          intent === null
            ? []
            : pageTags({
                intent,
                resolvedEntity: ctx.resolvedEntity,
                frontPageEntryTypes: () => listedEntryTypeNames(ctx.plugins),
                taxonomyEntryTypes: (taxonomy) =>
                  termPageEntryTypeNames(ctx.plugins, taxonomy),
              });
        const declared = declaredPageTags(ctx);
        return declared.length === 0
          ? routeTags
          : [...new Set([...routeTags, ...declared])];
      },
      personal: () => renderIsPersonal(ctx),
    });
  } catch (err) {
    return renderPublicError(app, ctx, url, err);
  }
}

async function renderPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  routed: ContentRoute,
  segment: Segment,
): Promise<Response> {
  const renderEnv = app.renderEnv;
  const response = await ctx.telemetry.span("resolve", async (s) => {
    try {
      return await routed.render(ctx);
    } finally {
      // In a `finally` so a throwing render still stamps what had resolved; the
      // failure trace matters most.
      s.set("route.intent", () => routed.intent?.kind ?? "none");
      if (ctx.resolvedEntity) s.set("resolve.entity", ctx.resolvedEntity);
      if (ctx.resolvedTemplate) {
        s.set("template.matched", ctx.resolvedTemplate);
      }
    }
  });
  markAudience(response, ctx, segment);
  if (response.status === 404 && acceptsHtml(ctx.request)) {
    const html = await renderErrorThroughTheme({
      ctx,
      renderEnv,
      kind: "not-found",
      data: {
        kind: "error",
        request: ctx.request,
        hint: response.headers.get("x-plumix-hint") ?? undefined,
      },
    });
    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(html, { status: 404, headers });
  }
  return response;
}

function markAudience(
  response: Response,
  ctx: AppContext,
  segment: Segment,
): void {
  // Gives a client-side unlock the hard gate's signal. Skipped on a 404, where
  // the teaser resolved to nothing.
  const gate = ctx.access?.gate;
  if (gate?.type === "challenge" && gate.soft && response.status !== 404) {
    response.headers.set("x-plumix-challenge", gate.kind);
  }
  // Downstream caches don't know the segment axis, so only the anonymous
  // document may be stored under the plain URL.
  if (segment !== "anonymous") {
    response.headers.set("cache-control", "private, no-store");
    response.headers.append("vary", "cookie");
  }
}

async function renderPublicError(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  err: unknown,
): Promise<Response> {
  const renderEnv = app.renderEnv;
  ctx.logger.error("dispatch_failed", {
    requestId: ctx.requestId,
    url: url.href,
    err: err instanceof Error ? err.message : String(err),
  });
  const devResponse = devFailureResponse(ctx, err, acceptsHtml(ctx.request));
  if (devResponse) return devResponse;
  // An untrusted dev request loses the stack, not the page: it still gets the
  // theme's error template.
  if (
    (!process.env.PLUMIX_DEV || !isTrustedDevRequest(ctx.request)) &&
    acceptsHtml(ctx.request)
  ) {
    try {
      const html = await renderErrorThroughTheme({
        ctx,
        renderEnv,
        kind: "server-error",
        data: { kind: "error", request: ctx.request, errorId: ctx.requestId },
      });
      return new Response(html, {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (templateErr) {
      ctx.logger.error("error_template_failed", {
        url: url.href,
        err:
          templateErr instanceof Error
            ? templateErr.message
            : String(templateErr),
      });
    }
  }
  return new Response("Internal Server Error", {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Null in production and for an untrusted dev request, so the caller's own 500
 * answers. `process.env.PLUMIX_DEV` is Vite-empty in production builds, which
 * is what tree-shakes the dev error surface out.
 */
function devFailureResponse(
  ctx: AppContext,
  err: unknown,
  wantsHtml: boolean,
): Response | null {
  if (!process.env.PLUMIX_DEV || !isTrustedDevRequest(ctx.request)) {
    return null;
  }
  return devErrorResponse(ctx, err, wantsHtml);
}

// Stricter than `acceptsHtml`: a bare `fetch` sends `*/*` and can't parse a
// document.
function negotiatesHtml(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (accept === null) return false;
  return (
    accept.includes("text/html") || accept.includes("application/xhtml+xml")
  );
}

/**
 * Only a client that explicitly negotiates away from HTML skips the themed
 * error page.
 */
function acceptsHtml(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (accept === null) return true;
  return (
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml") ||
    accept.includes("*/*")
  );
}

/**
 * What an unrecognised `/_plumix/` path answers with, shared so a dev-only
 * route's off-loopback 404 is byte-identical to a path that never existed.
 */
const UNKNOWN_PLUMIX_ROUTE = "unknown-plumix-route";

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

/** No auth gate: a route at the site root is public by construction. */
function servePublicRoute(
  match: PublicRouteMatch,
  ctx: AppContext,
): Promise<Response> {
  const run = async () => match.route.handler(ctx.request, ctx, match.params);
  const cdn = ctx.cdn;
  if (match.route.cacheable !== true || cdn === undefined) return run();
  return readThroughRoute({
    request: ctx.request,
    hasSession: ctxHasSession(ctx),
    cdn,
    defer: ctx.defer,
    telemetry: ctx.telemetry,
    render: run,
    tags: () => declaredPageTags(ctx),
  });
}

/** Renders per reader, so it stays out of the CDN whatever `cacheable` says. */
async function servePoliciedPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  match: PublicRouteMatch,
  policy: AccessPolicy,
): Promise<Response> {
  ctx = await loadUserForPublicRequest(ctx);
  const access = await resolveAccess(ctx, policy);
  const gated = gateToResponse(access.gate, {
    ctx,
    url,
    loginPath: resolveLoginPath(app.config.auth),
  });
  if (gated !== null) return gated;
  ctx.access = access;
  const response = await match.route.handler(ctx.request, ctx, match.params);
  markAudience(response, ctx, segmentForAudience(ctx, access.segment));
  return response;
}

/**
 * For `formPost`-exempt requests. `hasSession` must be explicit, or
 * `requestHasSession` sniffs the cookie still on the request.
 */
const anonymousAuthenticator: RequestAuthenticator = {
  authenticate: () => Promise.resolve(null),
  hasSession: () => false,
};

/**
 * Keyed on the header: the exemption is per request. Coupled to
 * `enforcePlumixCsrf`; a second way past its header check would keep the
 * session.
 */
function withoutAmbientSession(
  route: RegisteredRawRoute,
  ctx: AppContext,
): AppContext {
  if (route.formPost !== true || hasCsrfHeader(ctx.request)) return ctx;
  return { ...ctx, authenticator: anonymousAuthenticator };
}

function dispatchPluginRawRoute(
  route: RegisteredRawRoute,
  ctx: AppContext,
): Promise<Response> {
  const scoped = withoutAmbientSession(route, ctx);
  if (scoped === ctx) return serveRawRoute(route, ctx);
  // Otherwise `getContext()` would still hand out the session-bearing context.
  return requestStore.run(scoped, () => serveRawRoute(route, scoped));
}

/**
 * A raw route reaches the CDN on its own `cacheable: true` opt-in, and
 * only where the deploy bound a CDN.
 */
function serveRawRoute(
  route: RegisteredRawRoute,
  ctx: AppContext,
): Promise<Response> {
  const cdn = ctx.cdn;
  if (route.cacheable !== true || cdn === undefined) {
    return runPluginRawRoute(route, ctx);
  }
  return readThroughRoute({
    request: ctx.request,
    hasSession: ctxHasSession(ctx),
    cdn,
    defer: ctx.defer,
    telemetry: ctx.telemetry,
    render: () => runPluginRawRoute(route, ctx),
    // Read after the handler ran: a route resolves the entity it answers for
    // mid-request, and `tagCdnEntry` is where it names what that was.
    tags: () => declaredPageTags(ctx),
  });
}

/** The route's own work: enforce its `auth` gate, then run its handler. */
async function runPluginRawRoute(
  route: RegisteredRawRoute,
  ctx: AppContext,
): Promise<Response> {
  const gate = route.auth;
  if (gate === "public") {
    return route.handler(ctx.request, ctx);
  }

  // Off-loopback it is absent, not unauthorized: a distinguishable answer would
  // disclose it exists.
  if (gate === "development") {
    return isTrustedDevRequest(ctx.request)
      ? route.handler(ctx.request, ctx)
      : notFound(UNKNOWN_PLUMIX_ROUTE);
  }

  const result = await authenticateTraced(ctx, ctx.authenticator);
  if (!result) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  const { id, email, name, role, meta } = result.user;
  const tokenScopes = tokenScopesOf(result);
  const authedCtx = withUser(ctx, { id, email, name, role, meta }, tokenScopes);

  if (gate === "authenticated") {
    return route.handler(authedCtx.request, authedCtx);
  }
  const capability = gate.capability;
  // Through `auth.can()` so token scopes narrow plugin routes as they do RPC.
  if (!authedCtx.auth.can(capability)) {
    return jsonResponse(
      {
        error: "forbidden",
        capability: resolveCapability(authedCtx.plugins, capability),
      },
      { status: 403 },
    );
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
    // Under a mount the platform asset layer can't match (its paths omit the
    // prefix); at the root a miss is a genuine 404.
    if (ctx.config.basePath !== "") {
      return ctx.assets.fetch(
        new Request(new URL(ctx.request.url), ctx.request),
      );
    }
    return notFound("admin-asset-not-found");
  }
  // The prefix URL, not `index.html`, which redirects under SPA
  // `not_found_handling` and miniflare.
  const indexUrl = new URL(`${ADMIN_PREFIX}/`, ctx.request.url);
  const upstream = await ctx.assets.fetch(new Request(indexUrl, ctx.request));
  const contentType = upstream.headers.get("content-type")?.toLowerCase();
  if (!contentType?.includes("text/html")) return upstream;

  // Otherwise a Bearer-only request would bump `api_tokens.lastUsedAt` on every
  // cross-site navigation.
  const auth = ctxHasSession(ctx)
    ? await authenticateTraced(ctx, ctx.authenticator)
    : null;
  // Non-staff would get a shell whose every RPC 403s; anonymous visitors still
  // need the SPA's login screen.
  if (auth?.user && !canAccessAdmin(auth.user.role)) {
    return redirect(withBasePath("/", ctx.config.basePath), 302);
  }
  const locale = resolveLocale({
    request: ctx.request,
    user: auth?.user ?? null,
    i18n: ctx.config.i18n,
  });

  // Rewrite invalidates upstream body-shape headers: encoding stops applying
  // (`upstream.text()` already decompressed), length is wrong (the new tag is
  // longer), etag refers to the original bytes.
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("etag");
  // Body varies per request locale; keep it out of shared caches.
  headers.set("cache-control", "private, no-cache");
  headers.append("vary", "cookie, accept-language");

  // Lets one precompiled admin serve at the root or any subdirectory without a
  // rebuild.
  const baseHref = withBasePath(`${ADMIN_PREFIX}/`, ctx.config.basePath);
  const html = await upstream.text();
  const shell = injectAdminBaseHref(
    rewriteAdminShellLangDir(html, locale),
    baseHref,
  );
  return new Response(shell, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
