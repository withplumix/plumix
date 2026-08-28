import type { Segment } from "../access/policy.js";
import type { RequestAuthenticator } from "../auth/authenticator.js";
import type * as AuthFlowRoutes from "../auth/flow-routes.js";
import type { AppContext } from "../context/app.js";
import type { RegisteredRawRoute } from "../plugin/manifest.js";
import type { RouteIntent } from "../route/intent.js";
import type { RouteMatch } from "../route/match.js";
import type { PublicRouteMatch } from "../route/public-routes.js";
import type { RedirectResolution } from "../route/redirects.js";
import type { PlumixApp } from "./app.js";
import {
  gateToResponse,
  policyForMatch,
  resolveLoginPath,
} from "../access/gate.js";
import { PRIVATE_SEGMENT, resolveAccess } from "../access/policy.js";
import { authenticateTraced } from "../auth/authenticator.js";
import { readSessionCookie } from "../auth/cookies.js";
import {
  hasCsrfHeader,
  hasMatchingOrigin,
  isLoopbackOrigin,
} from "../auth/csrf.js";
import { parseOAuthPath } from "../auth/oauth/match.js";
import { canAccessAdmin } from "../auth/rbac.js";
import { stripBasePath, withBasePath } from "../base-path.js";
import {
  requestCarriesEphemeralGrant,
  requestIsPrivileged,
} from "../cache/decision.js";
import { embeddedPageTags } from "../cache/embedded-tags.js";
import { flushPurgeTags } from "../cache/purge.js";
import { readThrough, readThroughRoute } from "../cache/read-through.js";
import { cacheTagsFor } from "../cache/route-tags.js";
import { pageTags } from "../cache/tags.js";
import { interfaceEnabled } from "../config.js";
import { withUser } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { collectDevErrorContext } from "../dev/server/context.js";
import { collectDevErrorHints } from "../dev/server/hints/collect.js";
import { collectDevErrorPanels } from "../dev/server/panels/collect.js";
import { devErrorJson, renderDevErrorPage } from "../dev/server/render.js";
import { isTrustedDevRequest } from "../dev/trust.js";
import { resolveLocale } from "../i18n/resolve-locale.js";
import { matchRoute } from "../route/match.js";
import { matchPublicRoute } from "../route/public-routes.js";
import { matchRedirect } from "../route/redirects.js";
import { renderErrorThroughTheme } from "../route/render/render-template.js";
import { resolvePublicRoute } from "../route/resolve.js";
import { canonicalRedirectTarget } from "../seo/canonical.js";
import {
  injectAdminBaseHref,
  rewriteAdminShellLangDir,
} from "./admin-shell.js";
import {
  forbidden,
  gone,
  jsonResponse,
  methodNotAllowed,
  notFound,
  permanentRedirect,
  redirect,
} from "./http.js";
import { loadUserForPublicRequest } from "./load-user-for-public-request.js";
import { deliverTelemetrySnapshot } from "./telemetry-delivery.js";

const RPC_PREFIX = "/_plumix/rpc";
const ADMIN_PREFIX = "/_plumix/admin";
const AUTH_PREFIX = "/_plumix/auth/";
const PLUMIX_PREFIX = "/_plumix/";
const MCP_PATH = "/_plumix/mcp";
const API_PREFIX = "/_plumix/api";
// Dev request-history read routes. Inlined rather than imported so the
// dispatcher's eager graph references no debug-bar module at all — it reaches
// the feature only through the dev-gated dynamic import below (Vite-empty in a
// build, so the branch and its import drop out). Keep in step with
// `DEBUG_REQUESTS_PATH`.
const DEBUG_REQUESTS_PREFIX = "/_plumix/debug/requests";
// The `/_plumix/` sub-prefixes core answers itself, ahead of the plugin table.
// A plugin whose id names one of them registers routes it can never serve, so
// the raw-route branch skips those paths — and so does the CSRF exemption,
// where it is load-bearing: without it a plugin id'd `rpc` could drop the
// header gate in front of the cookie-authenticated RPC router it never runs.
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

// Auth-flow handlers (passkey/oauth/magic-link/device/email-change) are
// admin-login cold paths — never the public render path. Load them via one
// memoized dynamic import on the first auth-flow request per isolate so their
// heavy graph (webauthn/oslo, arctic) stays off the public render cold-start
// path; the lightweight path matchers below stay eager.
let authFlowRoutes: Promise<typeof AuthFlowRoutes> | undefined;
function loadAuthFlowRoutes(): Promise<typeof AuthFlowRoutes> {
  return (authFlowRoutes ??= import("../auth/flow-routes.js"));
}

// Filenames look like `index.html`, `chunk-abc.js`, `fonts/g.woff2` — paths
// with a dot-suffix after the last slash. Deep-link SPA routes never match.
const ASSET_LIKE = /\.[^/]+$/;

// Extensions that only ever name static assets (favicon.ico, hashed chunks,
// images, fonts). Slugs are slug-shaped by schema — never contain dots — so no
// entry or term URL can collide (#1491). Deliberately excludes
// content-plausible extensions (`.txt`, `.xml`, `.json`, `.html`) so routes
// like an `ads.txt` or podcast-feed plugin keep working.
const STATIC_ASSET_EXT =
  /\.(?:ico|css|js|mjs|map|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|wasm)$/i;

// Cacheable because the extension check makes the path permanently
// unroutable — a short TTL only bounds "a deploy added this asset". The
// edge cache stores GET+200 only, so this reaches browsers/CDNs, not the
// shared read-through layer.
function cacheableAssetNotFound(hint: string): Response {
  const response = notFound(hint);
  response.headers.set("cache-control", "public, max-age=300");
  return response;
}

type RouteHandler = (ctx: AppContext, app: PlumixApp) => Promise<Response>;
// Maps a path to its handler accessor on the lazily-loaded module, so the map
// itself pulls no handler code into the eager graph — only the matching paths.
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
  ["/_plumix/auth/signout", (h) => (ctx) => h.handleSignout(ctx)],
]);

const MAGIC_LINK_VERIFY_PATH = "/_plumix/auth/magic-link/verify";
const EMAIL_CHANGE_VERIFY_PATH = "/_plumix/auth/verify-email";

export type PlumixDispatcher = (ctx: AppContext) => Promise<Response>;

export function createPlumixDispatcher(app: PlumixApp): PlumixDispatcher {
  return async (ctx) => {
    const startedAt = Date.now();
    let response: Response;
    try {
      // The top-level span. `ctx.telemetry` is the no-op collector unless a
      // consumer sampled this request, so span() is then a pass-through.
      response = await ctx.telemetry.span("dispatch", async (s) => {
        const routed = await route(app, ctx);
        s.set("http.response.status_code", routed.status);
        return routed;
      });
      // Request-end seam: fire one batched edge-cache purge for whatever
      // entry mutations this request accumulated.
      flushPurgeTags(ctx);
    } catch (error) {
      ctx.logger.error("dispatch_failed", {
        error,
        url: ctx.request.url,
        method: ctx.request.method,
      });
      // Everything mounted under `/_plumix/` — a plugin route above all — lands
      // here rather than on the public render's error path, so it gets the same
      // dev treatment: the exception and its stack instead of an opaque code.
      // These routes are machine-facing by default, so the page is served only
      // to a client that actually asked for HTML — a browser opening the URL.
      // `*/*` (a bare `fetch`) takes the JSON, which is what it can parse.
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
    // Nothing is left in front of the route but the Origin check, so it has to
    // be satisfied rather than merely not contradicted — `registerRoute`
    // documents why that is enough on a route that took the opt-out.
    return enforceOrigin(app, ctx);
  }
  // Defense-in-depth: the custom-header check already blocks cross-origin
  // POSTs (a browser can't set X-Plumix-Request without a CORS preflight,
  // which Plumix never grants). If an Origin header is present anyway,
  // reject mismatches too — protects against a future misconfigured CORS
  // layer or an intermediate that strips/forwards headers loosely.
  if (!ctx.request.headers.has("origin")) return null;
  return enforceOrigin(app, ctx);
}

// Narrowed to POST because that is all an HTML form can produce: a route
// registered as `method: "*"` doesn't carry its exemption onto PUT or DELETE,
// which no form could have sent. The table scan is reached by any headerless
// POST under `/_plumix/`, an attacker's included, so it stays behind the two
// cheap string tests above it.
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
  // A same-origin request — Origin equals the host it targets — is by
  // definition not cross-site forgery, so accept it even when the canonical
  // app.origin differs. This covers deploys served on more than one host and
  // the demo sandbox, whose origin varies per deploy and can't be pinned in
  // config.
  if (isSameOrigin(ctx.request)) return null;
  // devCsrfLocalhost is statically false in production builds; see its
  // declaration on RuntimeContext for why dev needs the relaxation.
  if (app.devCsrfLocalhost && hasLocalhostOrigin(ctx.request)) return null;
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

// Strip the configured subdirectory prefix once, at the edge, by rewriting the
// request URL to its root-relative form. Every downstream branch and sub-handler
// (RPC, MCP, REST, auth flows, plugin routes, the public router, the admin
// shell) then matches root-relative paths with no base awareness of its own;
// outbound URL builders re-add the prefix via `withBasePath`. A request that
// isn't under the base (e.g. the bare domain root when mounted at
// `/custom-directory`) isn't part of the mounted site — 404 it. A root
// deployment (`basePath === ""`) leaves the request untouched.
function stripBasePathOrReject(
  app: PlumixApp,
  ctx: AppContext,
): AppContext | Response {
  if (app.basePath === "") return ctx;
  const rawUrl = new URL(ctx.request.url);
  const stripped = stripBasePath(rawUrl.pathname, app.basePath);
  if (stripped === null) {
    // Asset-shaped misses (chiefly the browser's root favicon probe, which
    // targets the domain root, not the mount) get the cacheable 404 (#1514).
    return STATIC_ASSET_EXT.test(rawUrl.pathname)
      ? cacheableAssetNotFound("outside-base-path")
      : notFound("outside-base-path");
  }
  rawUrl.pathname = stripped;
  return { ...ctx, request: new Request(rawUrl, ctx.request) };
}

// The two interfaces mounted ahead of the CSRF gate. Both authenticate by
// bearer token (MCP) or anonymous read (REST), so they're inherently
// CSRF-immune — a cross-origin browser can't attach an Authorization header or
// the X-Plumix-Request header without a CORS grant Plumix never gives. Returns
// null for any other path so the gate below keeps protecting the cookie-authed
// RPC/auth endpoints unchanged. Both stay default-off and 404 *before* their
// dynamic import, so a disabled deployment never pulls the MCP SDK + tool
// registry or the @orpc/openapi graph onto the cold-start path.
async function tryColdInterfaces(
  app: PlumixApp,
  ctx: AppContext,
  pathname: string,
): Promise<Response | null> {
  if (pathname === MCP_PATH) {
    // Default-off in production; auto-enabled in dev so a connected coding
    // agent reaches it with no config flag. `devCsrfLocalhost` is statically
    // false in production builds, so the auto-enable never applies there.
    if (!interfaceEnabled(app.config.mcp) && !app.devCsrfLocalhost) {
      return notFound("mcp-disabled");
    }
    const handleMcpRequest = await app.loadMcpHandler();
    return handleMcpRequest(ctx, app.devCsrfLocalhost);
  }
  if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
    if (!interfaceEnabled(app.config.api)) return notFound("api-disabled");
    const dispatchRest = await app.loadRestHandler();
    return dispatchRest(ctx);
  }
  return null;
}

// Everything mounted under `/_plumix/` behind the CSRF gate: RPC, the auth
// flows (POST endpoints, OAuth, magic-link/email-change verify), the admin
// shell, and plugin-registered raw routes. Returns null for any non-plumix path
// so the public router below owns it; a plumix path that matches nothing 404s
// here rather than falling through to the public map. Auth-flow handlers load
// via one memoized dynamic import on first use, keeping their heavy
// webauthn/oslo/arctic graph off the public render cold-start path.
async function tryPlumixRoutes(
  app: PlumixApp,
  ctx: AppContext,
  pathname: string,
): Promise<Response | null> {
  if (pathname.startsWith(PLUMIX_PREFIX)) {
    const csrfFailure = enforcePlumixCsrf(app, ctx, pathname);
    if (csrfFailure) return csrfFailure;
  }

  // Dev-only: the captured request-history read routes (dead-code-eliminated
  // in a build; see DEBUG_REQUESTS_PREFIX for the tree-shaking rationale).
  if (
    process.env.PLUMIX_DEV &&
    isTrustedDevRequest(ctx.request) &&
    (pathname === DEBUG_REQUESTS_PREFIX ||
      pathname.startsWith(`${DEBUG_REQUESTS_PREFIX}/`))
  ) {
    const { handleDebugRequests } =
      await import("../dev/debug-bar/read-routes.js");
    return handleDebugRequests(ctx);
  }

  if (pathname === RPC_PREFIX || pathname.startsWith(`${RPC_PREFIX}/`)) {
    const rpcHandler = await app.loadRpcHandler();
    const result = await rpcHandler.handle(ctx.request, {
      prefix: RPC_PREFIX,
      context: ctx,
    });
    return result.matched
      ? result.response
      : notFound("rpc-procedure-not-found");
  }

  const authRoute = POST_AUTH_ROUTES.get(pathname);
  if (authRoute) {
    if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
    const handlers = await loadAuthFlowRoutes();
    return authRoute(handlers)(ctx, app);
  }

  // OAuth endpoints are top-level GET navigations from the browser, so they
  // can't carry the X-Plumix-Request header. The CSRF gate already lets
  // safe methods through, and the state token is the per-request CSRF
  // anchor for the callback. Match the path *and* enforce GET here.
  const oauth = parseOAuthPath(pathname);
  if (oauth) {
    if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
    const handlers = await loadAuthFlowRoutes();
    return oauth.tail === "start"
      ? handlers.handleOAuthStart(ctx, app, oauth.params.providerKey)
      : handlers.handleOAuthCallback(ctx, app, oauth.params.providerKey);
  }

  // Magic-link verify is the same shape — top-level GET from the user's
  // mail client. The 192-bit single-use token in `?token=…` is the
  // per-request CSRF anchor.
  if (pathname === MAGIC_LINK_VERIFY_PATH) {
    if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
    return (await loadAuthFlowRoutes()).handleMagicLinkVerify(ctx, app);
  }

  // Email-change verify — same anchor model. The link goes to the
  // user's *new* mailbox (proves they own it); clicking commits the
  // change atomically + invalidates every session for that user.
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

// The public site: only GET/HEAD are meaningful past this point. A plugin's
// registered public routes answer first — `/robots.txt`, the sitemap and the
// feeds are all plugin-owned now, and each answers ahead of the redirect table
// so no rewrite rule can shadow one. Then a non-canonical URL 301s to its
// slash-less form before the route map runs, and anything left renders through
// the public router.
async function tryPublicRoutes(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  const { pathname } = url;
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const publicRoute = matchPublicRoute(app.publicRoutes, pathname);
  if (publicRoute !== null) return servePublicRoute(publicRoute, ctx);

  // Plugin/site/theme-registered redirects (301/302/307/308) and 410s. Matched
  // ahead of both the asset-404 shortcut (so a moved image/css/js can redirect)
  // and the content route map (so a redirect shadows a would-be page). The
  // registered public routes above still win.
  const redirect = matchRedirect(url, app.redirects);
  if (redirect !== null) return redirectResponse(redirect);

  // Asset-shaped misses (favicon.ico, /assets/* the platform's asset layer
  // didn't own) 404 cheaply before route resolution — no slug lookup, no
  // themed render.
  if (STATIC_ASSET_EXT.test(pathname)) {
    return cacheableAssetNotFound("static-asset");
  }

  // Normalize a public page URL to its canonical (slash-less) shape before
  // routing — the 301 target shares `canonicalUrl` with the rel=canonical tag.
  const canonical = canonicalRedirectTarget(ctx, app.publicRoutes);
  if (canonical !== null) return permanentRedirect(canonical);

  return dispatchPublicRoute(app, ctx, url);
}

// Build the HTTP response for a matched redirect rule: a redirect status with
// just the Location header, or a 410 for `gone`.
function redirectResponse(resolution: RedirectResolution): Response {
  return resolution.kind === "gone"
    ? gone("redirect-gone")
    : redirect(resolution.location, resolution.status);
}

// The public route intent for a resolved match: an unmatched root is the front
// page, any other unmatched URL is a 404 (never cached).
function publicIntent(match: RouteMatch | null, url: URL): RouteIntent | null {
  if (match !== null) return match.intent;
  if (url.pathname === "/") return { kind: "front-page" };
  return null;
}

// Public, non-hierarchical entry types — the set the front page lists, and so
// the set of `t:<type>` tags the front page is stored under.
function frontPageEntryTypes(ctx: AppContext): string[] {
  return Array.from(ctx.plugins.entryTypes.entries())
    .filter(
      ([, spec]) => spec.isPublic !== false && spec.isHierarchical !== true,
    )
    .map(([key]) => key);
}

async function dispatchPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  // Resolve the route once here and thread it into rendering so a cache miss
  // doesn't re-run `matchRoute` on the hot public-render path.
  const match = matchRoute(url, app.routeMap);
  try {
    // Load the principal once, before the cache decision, so a policied route
    // resolves its segment (and any I/O-bearing entitlement check) up front.
    // The loader early-returns for session-less traffic, so the anonymous hot
    // path — the only one that reaches a cache hit without a policy — pays
    // nothing.
    ctx = await loadUserForPublicRequest(ctx);

    // `null` ⇒ un-policied: no gate, and the segment derives from today's
    // privileged signal (below), so ordinary pages behave exactly as before. A
    // per-entry-policied single intent resolves the addressed entry here — via
    // the same request memo the renderer reuses, so the gate and the render
    // share one lookup. Runs after the principal loads so any per-entry
    // resolution keys off the same memo threaded into the live render.
    const policy = await policyForMatch(ctx, match);

    // The audience segment is the cache-key axis. A policied route runs its
    // resolver (gate + segment); a non-`allow` gate short-circuits before any
    // content resolves — fail-closed, gating by entry *type* so a gated type
    // refuses even a would-be-404 URL rather than leak which slugs exist. An
    // un-policied route maps a privileged request to `private` (never
    // shared-cached, as today) and everyone else to `anonymous`.
    let segment: Segment;
    if (policy !== null) {
      const access = await resolveAccess(ctx, policy);
      const gated = gateToResponse(access.gate, {
        ctx,
        url,
        loginPath: resolveLoginPath(app.config.auth),
      });
      if (gated !== null) return gated;
      // The render proceeds (an `allow`, or a soft `challenge` teaser). Expose
      // the decision so a theme template can branch the render — a soft gate
      // reads `ctx.access.gate` to serve the teaser variant.
      ctx.access = access;
      // A `?preview=` draft link or `?plumix.edit` editor session is authorized
      // per-request, not by audience membership: its render (a draft, or the
      // editor runtime) must never be stored under the shared segment entry and
      // outlive that grant. The un-policied branch gets this via
      // `requestIsPrivileged`; here the segment would otherwise be cacheable.
      segment = requestCarriesEphemeralGrant(ctx.request)
        ? PRIVATE_SEGMENT
        : access.segment;
    } else {
      segment = requestIsPrivileged(ctx.request)
        ? PRIVATE_SEGMENT
        : "anonymous";
    }

    const cache = ctx.cache;
    // No cache binding ⇒ every render is live and the read-through is never
    // consulted. With a cache, a `private` segment still flows through it: the
    // read-through bypasses internally (recording the decision) and renders
    // live, so the telemetry stays uniform across cached and bypassed requests.
    if (cache === undefined) {
      return await renderPublicRoute(app, ctx, url, match, segment);
    }
    const intent = publicIntent(match, url);
    return await readThrough({
      request: ctx.request,
      segment,
      intentKind: intent?.kind ?? null,
      // A custom archive caches only when it opted in via `registerArchiveType
      // ({ cacheable: true })`. Resolved here so the pure decision layer stays
      // free of the registry lookup.
      customArchiveCacheable:
        intent?.kind === "custom"
          ? ctx.plugins.archiveTypes.get(intent.name)?.cacheable === true
          : undefined,
      cache,
      defer: ctx.defer,
      telemetry: ctx.telemetry,
      render: () => renderPublicRoute(app, ctx, url, match, segment),
      // Evaluated post-render so `ctx.resolvedEntity` (the entry id) is set
      // and read-time reference resolution has finished accumulating the tags
      // of the entities embedded in the page (#1508). The source thunks run only
      // for the intent kind that needs them. The tag vocabulary is unchanged:
      // segment variants share one tag set, so one publish purges them all.
      tags: () => {
        const routeTags =
          intent === null
            ? []
            : pageTags({
                intent,
                resolvedEntity: ctx.resolvedEntity,
                frontPageEntryTypes: () => frontPageEntryTypes(ctx),
                taxonomyEntryTypes: (taxonomy) =>
                  ctx.plugins.termTaxonomies.get(taxonomy)?.entryTypes ?? [],
              });
        const embedded = embeddedPageTags(ctx);
        return embedded.length === 0
          ? routeTags
          : [...new Set([...routeTags, ...embedded])];
      },
    });
  } catch (err) {
    return renderPublicError(app, ctx, url, err);
  }
}

async function renderPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  match: RouteMatch | null,
  segment: Segment,
): Promise<Response> {
  const renderEnv = app.renderEnv;
  // The principal is loaded and the gate enforced by the caller, before the
  // cache decision — this runs only on a live render (a cache miss, a `private`
  // segment, or no cache binding). Throws propagate to the caller's error path.
  const response = await ctx.telemetry.span("resolve", async (s) => {
    try {
      return await resolvePublicRouteOrFallback(app, ctx, url, match);
    } finally {
      // Attributes read post-resolution: the resolver writes
      // `resolvedEntity` / `resolvedTemplate` onto ctx during the render it
      // encloses. In a `finally` so a throwing render still stamps whatever
      // had resolved — the failure path is the trace that matters most.
      // Lazy thunks, so the no-op collector never evaluates them.
      s.set("route.intent", () => publicIntent(match, url)?.kind ?? "none");
      if (ctx.resolvedEntity) s.set("resolve.entity", ctx.resolvedEntity);
      if (ctx.resolvedTemplate) {
        s.set("template.matched", ctx.resolvedTemplate);
      }
    }
  });
  // A soft gate rendered a teaser: surface the challenge kind so a client-side
  // unlock (or an analytics hook) has the same signal the hard gate sends,
  // without the theme having to re-derive it from the DOM. Stored with the
  // segment variant, so the cached teaser carries it too. Skipped on a 404 —
  // the teaser resolved to nothing, so a challenge signal there is incoherent.
  const gate = ctx.access?.gate;
  if (gate?.type === "challenge" && gate.soft && response.status !== 404) {
    response.headers.set("x-plumix-challenge", gate.kind);
  }
  // Any non-`anonymous` segment's render can depend on the visitor, so the copy
  // sent to the client forbids a shared or browser cache from storing it under
  // the plain URL — a downstream intermediary is unaware of the segment axis.
  // A shared segment is still accelerated by the edge read-through above, which
  // stores its own segment-keyed, cookie-stripped clone; only the anonymous
  // public document is left cacheable downstream, exactly as before.
  if (segment !== "anonymous") {
    response.headers.set("cache-control", "private, no-store");
    response.headers.append("vary", "cookie");
  }
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

// Turn a thrown public-render error into the best response the environment can
// give: the standalone dev error page in dev, a themed 500 in production, and a
// JSON/plain-text fallback for non-HTML or a failing error render. Shared by
// the live render and the pre-render access resolution so a throw in either —
// including a developer's I/O-bearing policy resolver — lands here.
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
  // Every *trusted* dev answer is above (#1582); this is what production and an
  // untrusted dev request both get. Withholding the dev page off-loopback
  // withholds the stack, not the page — a reviewer on a phone still sees the
  // theme's own error template rather than a bare string (#2007). The literal
  // short-circuits to true in a production build, so the branch survives DCE
  // there exactly as it did.
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
 * The dev-only answer to a caught failure: the standalone error page, which is
 * theme-independent so it renders even when the theme is what threw, or JSON
 * for a caller `wantsHtml` says can't use one (#1599). Null in production and
 * when the dev page itself broke — the caller's plain 500 covers both (#1582).
 *
 * `process.env.PLUMIX_DEV` is Vite-empty in production builds, so this body and
 * the dev-page renderer it reaches tree-shake out.
 */
function devFailureResponse(
  ctx: AppContext,
  err: unknown,
  wantsHtml: boolean,
): Response | null {
  if (process.env.PLUMIX_DEV && isTrustedDevRequest(ctx.request)) {
    if (!wantsHtml) {
      return jsonResponse(
        devErrorJson(err, collectDevErrorHints(ctx.hooks, err, ctx)),
        { status: 500 },
      );
    }
    try {
      // Match "how to fix" hints for the caught error via the dev-only
      // `error_page:hints` filter (core's typed + untyped matchers, plus any
      // plugin subscribers) and surface them above the stack.
      const hints = collectDevErrorHints(ctx.hooks, err, ctx);
      // The request/route/database/timeline/application sections, read from the
      // same request-scoped collectors the debug bar uses (#1598). Dev sampling
      // is ensured regardless of the debug bar, so these are populated even
      // when the bar is off.
      const context = collectDevErrorContext(ctx);
      // Plugin-contributed panels via the dev-only `error_page:panels` filter
      // (#1626), each rendered in isolation and shown below the context. No
      // subscribers → an empty list and no extra sections.
      const panels = collectDevErrorPanels(ctx.hooks, err, ctx);
      return new Response(renderDevErrorPage(err, hints, context, panels), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (devErr) {
      ctx.logger.error("dev_error_page_failed", {
        url: ctx.request.url,
        err: devErr instanceof Error ? devErr.message : String(devErr),
      });
    }
  }
  return null;
}

// Whether the client named HTML outright. Stricter than `acceptsHtml`: a bare
// `fetch` sends `*/*` and gets a document it can only fail to parse, so the
// machine-facing `/_plumix/` surface asks this question instead.
function negotiatesHtml(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (accept === null) return false;
  return (
    accept.includes("text/html") || accept.includes("application/xhtml+xml")
  );
}

// Whether an error response should render through the theme at all. A missing
// Accept header or `*/*` (curl, bare fetch, browser subresource probes) keeps
// the themed page; only a client that explicitly negotiates away from HTML
// (`Accept: application/json`) gets the cheap plain-text error instead (#1491).
function acceptsHtml(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (accept === null) return true;
  return (
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml") ||
    accept.includes("*/*")
  );
}

async function resolvePublicRouteOrFallback(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  match: RouteMatch | null,
): Promise<Response> {
  const renderEnv = app.renderEnv;
  if (match !== null) {
    return resolvePublicRoute(ctx, match, renderEnv);
  }
  if (url.pathname === "/") {
    return resolvePublicRoute(
      ctx,
      { intent: { kind: "front-page" }, params: {} },
      renderEnv,
    );
  }
  return notFound("public-route-not-found");
}

// What an unrecognised `/_plumix/` path answers with, shared so a dev-only
// route's off-loopback 404 is byte-identical to a path that never existed.
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

// A registered public route, on the same edge-cache terms as a raw route: the
// `cacheable: true` opt-in, the handler's own tags, and a live run wherever the
// deploy bound no cache. There is no auth gate — a route at the site root is
// public by construction.
function servePublicRoute(
  match: PublicRouteMatch,
  ctx: AppContext,
): Promise<Response> {
  const run = async () => match.route.handler(ctx.request, ctx, match.params);
  const cache = ctx.cache;
  if (match.route.cacheable !== true || cache === undefined) return run();
  return readThroughRoute({
    request: ctx.request,
    cache,
    defer: ctx.defer,
    telemetry: ctx.telemetry,
    render: run,
    tags: () => cacheTagsFor(ctx),
  });
}

// What makes `registerRoute`'s no-privilege-from-session rule structural: a
// request admitted by the `formPost` CSRF exemption gets an authenticator that
// resolves nobody. `hasSession` has to say so explicitly — `requestHasSession`
// otherwise falls back to sniffing the session cookie, which is still on the
// request.
const anonymousAuthenticator: RequestAuthenticator = {
  authenticate: () => Promise.resolve(null),
  hasSession: () => false,
};

// Keyed on the header rather than the flag alone, because the exemption is per
// request: a JS-enhanced form posting to the same endpoint sets the header and
// went through the ordinary gate. The `formPost` half is then redundant —
// `acceptsFormPost` admits no other headerless request this far — but it keeps
// the function true on its own terms rather than on a gate 200 lines up.
//
// That coupling runs both ways, so anyone editing `enforcePlumixCsrf` has to
// come back here: dropping its POST narrowing would widen what arrives
// anonymous, and adding a second way past the header check — the shape
// `devCsrfLocalhost` already takes for Origin — would let a request through
// with its session still on it.
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
  if (scoped === ctx) return cacheRawRoute(route, ctx);
  // `getContext()` is the sanctioned way to read per-request state, and for a
  // hook listener the handler fires it is the only way — a `formPost` route
  // announcing a submission is exactly that shape. Leaving the ambient context
  // un-swapped would shut the door the handler holds and leave the one behind
  // it open, so the exempt context has to be the ambient one too.
  return requestStore.run(scoped, () => cacheRawRoute(route, scoped));
}

// A raw route reaches the edge cache on its own `cacheable: true` opt-in, and
// only where the deploy bound a cache.
function cacheRawRoute(
  route: RegisteredRawRoute,
  ctx: AppContext,
): Promise<Response> {
  const cache = ctx.cache;
  if (route.cacheable !== true || cache === undefined) {
    return runPluginRawRoute(route, ctx);
  }
  return readThroughRoute({
    request: ctx.request,
    cache,
    defer: ctx.defer,
    telemetry: ctx.telemetry,
    render: () => runPluginRawRoute(route, ctx),
    // Read after the handler ran: a route resolves the entity it answers for
    // mid-request, and `tagCacheEntry` is where it names what that was.
    tags: () => cacheTagsFor(ctx),
  });
}

// The route's own work: enforce its `auth` gate, then run its handler.
async function runPluginRawRoute(
  route: RegisteredRawRoute,
  ctx: AppContext,
): Promise<Response> {
  const gate = route.auth;
  if (gate === "public") {
    return route.handler(ctx.request, ctx);
  }

  // A dev-only route is not "unauthorized" off-loopback, it is absent — so this
  // answers with the same 404, hint included, that an unmatched `/_plumix/` path
  // gets. A distinguishable one would disclose what a 401 would.
  if (gate === "development") {
    return isTrustedDevRequest(ctx.request)
      ? route.handler(ctx.request, ctx)
      : notFound(UNKNOWN_PLUMIX_ROUTE);
  }

  // Same authenticator the RPC layer uses — session cookie by default,
  // operator override (e.g. `cfAccess()`) when configured. Plugin
  // route handlers don't need to know which guard is active; they just
  // declare `auth: "authenticated"` and the dispatcher delegates.
  const result = await authenticateTraced(ctx, ctx.authenticator);
  if (!result) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  const { id, email, name, role, meta } = result.user;
  const tokenScopes = result.tokenScopes ?? null;
  const authedCtx = withUser(ctx, { id, email, name, role, meta }, tokenScopes);

  if (gate === "authenticated") {
    return route.handler(authedCtx.request, authedCtx);
  }
  const capability = gate.capability;
  // Read through `authedCtx.auth.can()` so tokenScopes (PAT-style
  // narrowing) gates plugin routes the same way it gates RPC. Going
  // direct to `app.capabilityResolver.hasCapability` would bypass the
  // intersection check and let a token with `scopes: ["entry:post:read"]`
  // hit a plugin route gated on `entry:post:edit_any`.
  if (!authedCtx.auth.can(capability)) {
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
    // Under a subdirectory mount the platform asset layer never matched this
    // request — its bucket paths omit the prefix, so the (already base-stripped)
    // request fell through to the worker. Serve it from the binding here. At
    // the root the platform had its chance, so a miss is a genuine 404.
    if (ctx.basePath !== "") {
      return ctx.assets.fetch(
        new Request(new URL(ctx.request.url), ctx.request),
      );
    }
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
  const upstream = await ctx.assets.fetch(new Request(indexUrl, ctx.request));
  const contentType = upstream.headers.get("content-type")?.toLowerCase();
  if (!contentType?.includes("text/html")) return upstream;

  // Only run the authenticator when there's actually a session cookie to
  // validate — Bearer-only requests on the shell path would otherwise bump
  // `api_tokens.lastUsedAt` on every cross-site GET navigation. Anonymous
  // visitors hit the cookie + Accept-Language tiers of the resolver chain.
  const auth = readSessionCookie(ctx.request)
    ? await authenticateTraced(ctx, ctx.authenticator)
    : null;
  // A signed-in non-staff visitor (a `subscriber` from open signup) has no
  // admin surface — bounce them to the theme rather than hand over a shell
  // whose every RPC call would 403. Anonymous visitors fall through to the
  // SPA, which owns the login screen.
  if (auth?.user && !canAccessAdmin(auth.user.role)) {
    return redirect(withBasePath("/", ctx.basePath), 302);
  }
  const locale = resolveLocale({
    request: ctx.request,
    user: auth?.user ?? null,
    i18n: ctx.i18n,
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

  // `<base href>` anchors the relative-based client bundle (assets, the client
  // router's basepath, and the RPC URL) to wherever the admin is mounted, so
  // the same precompiled admin serves correctly at the root or under any
  // subdirectory without a rebuild.
  const baseHref = withBasePath(`${ADMIN_PREFIX}/`, ctx.basePath);
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
