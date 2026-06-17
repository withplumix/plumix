import type * as AuthFlowRoutes from "../auth/flow-routes.js";
import type { AppContext } from "../context/app.js";
import type * as McpDispatch from "../mcp/dispatch.js";
import type { RegisteredRawRoute } from "../plugin/manifest.js";
import type { RouteIntent } from "../route/intent.js";
import type { RouteMatch } from "../route/match.js";
import type { PlumixApp } from "./app.js";
import { readSessionCookie } from "../auth/cookies.js";
import { hasCsrfHeader, hasMatchingOrigin } from "../auth/csrf.js";
import { parseOAuthPath } from "../auth/oauth/match.js";
import { stripBasePath, withBasePath } from "../base-path.js";
import { readThrough } from "../cache/read-through.js";
import { interfaceEnabled } from "../config.js";
import { withUser } from "../context/app.js";
import { resolveLocale } from "../i18n/resolve-locale.js";
import { matchRoute } from "../route/match.js";
import { renderErrorThroughTheme } from "../route/render/render-template.js";
import { resolvePublicRoute } from "../route/resolve.js";
import { canonicalRedirectTarget } from "../seo/canonical.js";
import {
  handleFeed,
  isPublicEntryType,
  publicTaxonomyByBaseSlug,
} from "../seo/feed.js";
import { handleRobotsTxt } from "../seo/robots.js";
import { handleSitemapIndex, handleSubSitemap } from "../seo/sitemap.js";
import {
  injectAdminBaseHref,
  rewriteAdminShellLangDir,
} from "./admin-shell.js";
import {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFound,
  permanentRedirect,
} from "./http.js";
import { loadUserForPublicRequest } from "./load-user-for-public-request.js";

const RPC_PREFIX = "/_plumix/rpc";
const ADMIN_PREFIX = "/_plumix/admin";
const AUTH_PREFIX = "/_plumix/auth/";
const PLUMIX_PREFIX = "/_plumix/";
const MCP_PATH = "/_plumix/mcp";
const API_PREFIX = "/_plumix/api";
const ROBOTS_PATH = "/robots.txt";
const SITEMAP_INDEX_PATH = "/sitemap.xml";
// `/sitemap-<scope>-<page>.xml` — greedy scope so a hyphenated name keeps its
// hyphens and only the trailing `-<digits>` is the page.
const SUB_SITEMAP_PATTERN = /^\/sitemap-(.+)-(\d+)\.xml$/;
// `/feed`, `/feed/atom`, `/<type>/feed`, `/<type>/feed/atom`. The optional
// leading segment is the entry-type scope; `/feed*` reserves these paths the
// way WordPress does, so a page slugged "feed" can't shadow them.
const FEED_PATTERN = /^\/(?:([^/]+)\/)?feed(\/atom)?$/;
// `/<taxonomy>/<term>/feed` (+ `/atom`) — the term-scoped feed.
const TERM_FEED_PATTERN = /^\/([^/]+)\/([^/]+)\/feed(\/atom)?$/;

// MCP is cold-path-exclusive (an agent endpoint, never the public render path).
// Dynamic-import its handler so the tool registry and the MCP SDK it pulls in
// stay off the public render and cold-start paths, evaluating only on the first
// MCP request per isolate.
let mcpModule: Promise<typeof McpDispatch> | undefined;

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
    // devCsrfLocalhost is statically false in production builds; see its
    // declaration on RuntimeContext for why dev needs the relaxation.
    if (app.devCsrfLocalhost && hasLocalhostOrigin(ctx.request)) {
      return null;
    }
    return forbidden("csrf_origin_mismatch");
  }
  return null;
}

function hasLocalhostOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    // The whole 127.0.0.0/8 block is loopback, not just 127.0.0.1.
    // WHATWG URL always compresses IPv6 loopback to `[::1]`.
    return (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

async function route(app: PlumixApp, ctx: AppContext): Promise<Response> {
  // Strip the configured subdirectory prefix once, at the edge, by rewriting
  // the request URL to its root-relative form. Every downstream branch and
  // sub-handler (RPC, MCP, REST, auth flows, plugin routes, the public router,
  // the admin shell) then matches root-relative paths with no base awareness
  // of its own; outbound URL builders re-add the prefix via `withBasePath`. A
  // request that isn't under the base (e.g. the bare domain root when mounted
  // at `/custom-directory`) isn't part of the mounted site — 404 it. A root
  // deployment (`basePath === ""`) leaves the request untouched.
  if (app.basePath !== "") {
    const rawUrl = new URL(ctx.request.url);
    const stripped = stripBasePath(rawUrl.pathname, app.basePath);
    if (stripped === null) return notFound("outside-base-path");
    rawUrl.pathname = stripped;
    ctx = { ...ctx, request: new Request(rawUrl, ctx.request) };
  }

  const url = new URL(ctx.request.url);
  const { pathname } = url;

  // MCP is mounted ahead of the CSRF gate: it authenticates by bearer PAT,
  // which is inherently CSRF-immune (a browser can't attach an Authorization
  // header cross-site without a CORS grant Plumix never gives). The gate keeps
  // protecting the cookie-authed RPC/auth endpoints below it unchanged.
  if (pathname === MCP_PATH) {
    // Default-off: 404 before the dynamic import so a disabled deployment
    // never pulls the MCP SDK + tool registry onto the cold-start path.
    if (!interfaceEnabled(app.config.mcp)) return notFound("mcp-disabled");
    const { handleMcpRequest } = await (mcpModule ??=
      import("../mcp/dispatch.js"));
    return handleMcpRequest(ctx);
  }

  // REST sits ahead of the CSRF gate for the same reason MCP does: anonymous
  // (and future bearer) reads are CSRF-immune, and a cross-origin browser GET
  // can't carry the X-Plumix-Request header the gate demands. Default-off:
  // 404 before the dynamic import so the @orpc/openapi graph stays off the
  // cold-start path of a disabled deployment.
  if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
    if (!interfaceEnabled(app.config.api)) return notFound("api-disabled");
    const dispatchRest = await app.loadRestHandler();
    return dispatchRest(ctx);
  }

  if (pathname.startsWith(PLUMIX_PREFIX)) {
    const csrfFailure = enforcePlumixCsrf(app, ctx);
    if (csrfFailure) return csrfFailure;
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

  if (pathname.startsWith(PLUMIX_PREFIX) && !pathname.startsWith(AUTH_PREFIX)) {
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
    return notFound("unknown-plumix-route");
  }

  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  // Core SEO asset routes resolve ahead of the public route map so a plugin
  // rewrite rule can't shadow them.
  if (pathname === ROBOTS_PATH) {
    return handleRobotsTxt(ctx);
  }
  if (pathname === SITEMAP_INDEX_PATH) {
    return handleSitemapIndex(ctx);
  }
  const subSitemap = SUB_SITEMAP_PATTERN.exec(pathname);
  if (subSitemap) {
    return handleSubSitemap(ctx, subSitemap[1] ?? "", Number(subSitemap[2]));
  }
  const feed = FEED_PATTERN.exec(pathname);
  if (feed) {
    // A scoped `/<x>/feed` is a feed only when `<x>` is a public entry type;
    // otherwise it's a real path (e.g. a page slugged "feed") — fall through.
    const type = feed[1];
    if (type === undefined) {
      return handleFeed(ctx, { kind: "site" }, feed[2] ? "atom" : "rss2");
    }
    if (isPublicEntryType(ctx, type)) {
      return handleFeed(ctx, { kind: "type", type }, feed[2] ? "atom" : "rss2");
    }
  }
  const termFeed = TERM_FEED_PATTERN.exec(pathname);
  if (termFeed) {
    // Only a public taxonomy's archive space owns `/<taxonomy>/<term>/feed`;
    // anything else (e.g. a nested page) falls through to the public router.
    const taxonomy = publicTaxonomyByBaseSlug(ctx, termFeed[1] ?? "");
    if (taxonomy) {
      return handleFeed(
        ctx,
        { kind: "term", taxonomy: taxonomy.name, term: termFeed[2] ?? "" },
        termFeed[3] ? "atom" : "rss2",
      );
    }
  }

  // Normalize a public page URL to its canonical (slash-less) shape before
  // routing — the 301 target shares `canonicalUrl` with the rel=canonical tag.
  const canonical = canonicalRedirectTarget(ctx);
  if (canonical !== null) return permanentRedirect(canonical);

  return dispatchPublicRoute(app, ctx, url);
}

// The cache-decision intent kind for a resolved route match: an unmatched root
// is the front page, any other unmatched URL is a 404 (never cached).
function intentKindForMatch(
  match: RouteMatch | null,
  url: URL,
): RouteIntent["kind"] | null {
  if (match !== null) return match.intent.kind;
  if (url.pathname === "/") return "front-page";
  return null;
}

async function dispatchPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
): Promise<Response> {
  // Resolve the route once here and thread it into rendering so a cache miss
  // doesn't re-run `matchRoute` on the hot public-render path.
  const match = matchRoute(url, app.routeMap);
  const cache = ctx.cache;
  if (cache === undefined) return renderPublicRoute(app, ctx, url, match);
  return readThrough({
    request: ctx.request,
    intentKind: intentKindForMatch(match, url),
    cache,
    defer: ctx.defer,
    render: () => renderPublicRoute(app, ctx, url, match),
  });
}

async function renderPublicRoute(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  match: RouteMatch | null,
): Promise<Response> {
  const theme = app.config.theme;
  const document = app.document;
  const templateDocuments = app.templateDocuments;
  const templateDeps = app.plugins.templateDeps;
  const assetManifest = app.assetManifest;
  try {
    ctx = await loadUserForPublicRequest(ctx);
    const response = await resolvePublicRouteOrFallback(app, ctx, url, match);
    if (response.status === 404) {
      const html = await renderErrorThroughTheme({
        ctx,
        theme,
        document,
        templateDocuments,
        templateDeps,
        assetManifest,
        kind: "not-found",
        data: {
          request: ctx.request,
          hint: response.headers.get("x-plumix-hint") ?? undefined,
        },
      });
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, { status: 404, headers });
    }
    return response;
  } catch (err) {
    ctx.logger.error("dispatch_failed", {
      url: url.href,
      err: err instanceof Error ? err.message : String(err),
    });
    try {
      const html = await renderErrorThroughTheme({
        ctx,
        theme,
        document,
        templateDocuments,
        templateDeps,
        assetManifest,
        kind: "server-error",
        data: { request: ctx.request },
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
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }
}

async function resolvePublicRouteOrFallback(
  app: PlumixApp,
  ctx: AppContext,
  url: URL,
  match: RouteMatch | null,
): Promise<Response> {
  const theme = app.config.theme;
  const document = app.document;
  const templateDocuments = app.templateDocuments;
  const templateDeps = app.plugins.templateDeps;
  const assetManifest = app.assetManifest;
  if (match !== null) {
    return resolvePublicRoute(
      ctx,
      match,
      theme,
      document,
      templateDocuments,
      templateDeps,
      assetManifest,
    );
  }
  if (url.pathname === "/") {
    return resolvePublicRoute(
      ctx,
      { intent: { kind: "front-page" }, params: {} },
      theme,
      document,
      templateDocuments,
      templateDeps,
      assetManifest,
    );
  }
  return notFound("public-route-not-found");
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
): Promise<Response> {
  const gate = route.auth;
  if (gate === "public") {
    return route.handler(ctx.request, ctx);
  }

  // Same authenticator the RPC layer uses — session cookie by default,
  // operator override (e.g. `cfAccess()`) when configured. Plugin
  // route handlers don't need to know which guard is active; they just
  // declare `auth: "authenticated"` and the dispatcher delegates.
  const result = await ctx.authenticator.authenticate(ctx.request, ctx.db);
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
    ? await ctx.authenticator.authenticate(ctx.request, ctx.db)
    : null;
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
