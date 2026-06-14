import type { RPCHandler } from "@orpc/server/fetch";

import type {
  BlockRegistry,
  HtmlAllowlist,
  MarkSpec,
  ShortcodeRegistry,
} from "@plumix/blocks";
import {
  buildHtmlAllowlist,
  commitBlockVariations,
  coreBlocks,
  coreMarks,
  coreShortcodes,
  createBlockRegistry,
} from "@plumix/blocks";

import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { ResolvedPasskeyConfig } from "../auth/passkey/config.js";
import type { CapabilityResolver } from "../auth/rbac.js";
import type { SessionPolicy } from "../auth/sessions.js";
import type { PlumixConfig } from "../config.js";
import type { AppContext } from "../context/app.js";
import type {
  PluginRegistry,
  RegisteredRawRoute,
  RegisteredScheduledTask,
} from "../plugin/manifest.js";
import type { ContextExtensionEntry } from "../plugin/provides-context.js";
import type { RestDispatch } from "../rest/build-handler.js";
import type { RestRoute } from "../rest/rest-routes.js";
import type { RouteRule } from "../route/intent.js";
import type { AssetManifest } from "../route/render/asset-manifest.js";
import type { DocumentManifest } from "../theme.js";
import { registerCoreAdminBarContributors } from "../admin-bar/core-contributors.js";
import { defaultAuthenticator } from "../auth/authenticator.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { createCapabilityResolver } from "../auth/rbac.js";
import { DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import * as coreSchema from "../db/schema/index.js";
import { mergeDocumentManifest } from "../document-merge.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";
import { CORE_REST_ROUTES, routesOverlap } from "../rest/rest-routes.js";
import { compileRouteMap } from "../route/compile.js";
import { CORE_RPC_NAMESPACES } from "../rpc/namespaces.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { registerCoreSearchHandlers } from "../search/register-core-handlers.js";
import { registerCoreSitemapInvalidator } from "../seo/register-sitemap-invalidator.js";
import { registerCoreSettings } from "../settings-core.js";
import { registerCoreTemplateDeps } from "../template-deps-core.js";
import { isTemplate } from "../template.js";
import { ThemeRegistrationError } from "../theme-errors.js";
import { validateDocumentManifest } from "../theme.js";
import { AppBootError } from "./errors.js";
import { assembleShortcodeRegistry } from "./shortcode-registry.js";

export interface OAuthProviderSummary {
  /** Map key in `auth.oauth.providers`; the URL path segment. */
  readonly key: string;
  /** Human-readable name for the login button ("GitHub", "Google", …). */
  readonly label: string;
}

export interface PlumixApp {
  readonly config: PlumixConfig;
  readonly hooks: HookRegistry;
  readonly plugins: PluginRegistry;
  /**
   * Lazily builds (and memoizes) the merged oRPC handler on first call. Cold-
   * path-only — deferred so the heavy procedure graph + oRPC runtime never
   * evaluate on the public render cold-start path. The dispatcher awaits this
   * on an RPC request; nothing on the public path touches it.
   */
  readonly loadRpcHandler: () => Promise<RPCHandler<AppContext>>;
  /**
   * Lazily builds (and memoizes) the REST dispatcher on first call. Cold-path-
   * only and gated by `config.api` — deferred so the `@orpc/openapi` handler,
   * its router, and the spec generator never evaluate on the public render
   * cold-start path. Mirrors `loadRpcHandler`.
   */
  readonly loadRestHandler: () => Promise<RestDispatch>;
  /**
   * Canonical site origin (e.g. `https://cms.example.com`). Sourced from
   * the passkey config for now since that's the only place it lives in
   * user-facing config; exposed at the top level so CSRF / admin / future
   * features don't have to reach into `passkey.*` to learn it.
   */
  readonly origin: string;
  /** See RuntimeContext.devCsrfLocalhost — false in production builds. */
  readonly devCsrfLocalhost: boolean;
  readonly passkey: ResolvedPasskeyConfig;
  readonly sessionPolicy: SessionPolicy;
  /**
   * Resolved request authenticator. Defaults to the session-cookie
   * guard; an operator override (e.g. `cfAccess()`) replaces it. The
   * dispatcher and RPC middleware both call this on every authed
   * request to map request → user.
   */
  readonly authenticator: RequestAuthenticator;
  /**
   * Resolved boolean form of `auth.bootstrapVia`. True when external
   * sign-in flows (magic-link, OAuth, custom guard) may mint the very
   * first admin on a fresh deploy; false (default) keeps the bootstrap
   * rail passkey-only.
   */
  readonly bootstrapAllowed: boolean;
  /**
   * Public summary of configured OAuth providers — `{ key, label }` per
   * entry, derived from the user's `oauth.providers` map at app build
   * time. The login screen reads this verbatim through the
   * `auth.oauthProviders` RPC; secrets never leave config.
   */
  readonly oauthProviders: readonly OAuthProviderSummary[];
  readonly schema: Record<string, unknown>;
  /**
   * Sorted route map compiled once at `buildApp` from the plugin registry.
   * Module-scoped module-less equivalent: CF Worker isolates reuse this
   * across requests without re-derivation.
   */
  readonly routeMap: readonly RouteRule[];
  readonly rawRoutes: readonly RegisteredRawRoute[];
  readonly capabilityResolver: CapabilityResolver;
  /**
   * Plugin-contributed AppContext entries from `extendAppContext`.
   * Runtime adapters spread these onto every per-request `AppContext`
   * via `createAppContext({ appContextExtensions })`.
   */
  readonly appContextExtensions: ReadonlyMap<string, ContextExtensionEntry>;
  /**
   * Plugin-contributed scheduled tasks from `registerScheduledTask`.
   * Runtime adapters' `buildScheduledHandler` iterates this list on
   * every scheduled invocation; `runScheduledTasks(app, ctx)` is the
   * shared dispatch helper.
   */
  readonly scheduledTasks: readonly RegisteredScheduledTask[];
  /**
   * Merged block registry: `@plumix/blocks` core specs + plugin
   * contributions from `ctx.registerBlock`, built once at boot.
   */
  readonly blocks: BlockRegistry;
  /**
   * Aggregated mark catalogue: the 13 core marks from `@plumix/blocks` +
   * plugin contributions from `ctx.registerMark`. Surfaces in the manifest
   * + admin bubble menu; the rendering path uses the hardcoded
   * `renderInline` walker, not a per-spec component dispatch.
   */
  readonly marks: readonly MarkSpec[];
  /**
   * Merged shortcode registry the public render path threads into the
   * block walker (rich-text body expansion) and the resolve step (entry
   * title expansion): `coreShortcodes` < plugin `registerShortcode` <
   * `theme.shortcodes`, last-wins, built once at boot.
   */
  readonly shortcodes: ShortcodeRegistry;
  /**
   * Sanitizer allowlist `core/html` reads at render time. Built once
   * from the intrinsic baseline + `config.blocks.htmlAllowlist`.
   * Themes thread this through `<EntryContent htmlAllowlist={...}>`
   * so operator-extended tags / attrs actually reach the rendered
   * output rather than being silently swapped with the baseline.
   */
  readonly htmlAllowlist: HtmlAllowlist;
  /**
   * Document manifest after the `theme:document` filter chain runs.
   * Resolved once at boot from `config.theme.document ?? {}` so plugin
   * contributions surface in every SSR render without per-request merge
   * cost. Frozen post-resolution to keep the contract immutable.
   */
  readonly document: DocumentManifest;
  /**
   * Vite-emitted asset manifest baked into the worker bundle via
   * `virtual:plumix/asset-manifest`. The renderer reads this to inject
   * `<link rel="stylesheet">` tags for bundled theme CSS. Empty `{}`
   * in dev (Vite serves source directly) and when no client entries
   * exist (e.g. tests that don't run a full Vite build).
   */
  readonly assetManifest: AssetManifest;
  /**
   * Per-template merged document manifest. Each entry is the result
   * of `mergeDocumentManifest(app.document, template.document)`,
   * resolved once at boot and frozen. The renderer looks up by the
   * matched template slot (`single`, `archive`, `index`, etc.) so
   * per-request renders pay zero merge cost.
   */
  readonly templateDocuments: ReadonlyMap<string, DocumentManifest>;
}

// Runtime-only state the worker template injects at boot — values
// resolved by the Vite plugin from virtual modules (asset manifest).
// Kept internal: consumers (tests + the generated worker) pass an
// inline object literal that structurally satisfies the type.
interface RuntimeContext {
  readonly assetManifest?: AssetManifest;
  /**
   * Dev-server opt-in: treat any localhost origin as same-origin for
   * CSRF. `plumix dev` serves through vite on a port the user's config
   * cannot reliably predict (5173 by default, auto-incremented when
   * taken), so the generated worker passes `import.meta.env.DEV` here —
   * statically false in production builds.
   */
  readonly devCsrfLocalhost?: boolean;
}

export async function buildApp(
  config: PlumixConfig,
  runtime: RuntimeContext = {},
): Promise<PlumixApp> {
  const hooks = new HookRegistry();
  registerCoreAdminBarContributors(hooks);
  registerCoreSearchHandlers(hooks);
  registerCoreSitemapInvalidator(hooks);
  const seededRegistry = createPluginRegistry();
  registerCoreLookupAdapters(seededRegistry);
  registerCoreTemplateDeps(seededRegistry);
  registerCoreSettings(seededRegistry);
  const { registry, appContextExtensions } = await installPlugins({
    hooks,
    plugins: config.plugins,
    registry: seededRegistry,
  });

  // Defense-in-depth for JS callers — the type already requires `theme`,
  // but a hand-rolled config can still drop it.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for JS callers
  if (!config.theme) {
    throw ThemeRegistrationError.missingTheme();
  }
  const templates = config.theme.templates as Readonly<Record<string, unknown>>;
  if (!templates.index) {
    throw ThemeRegistrationError.missingIndexTemplate();
  }

  const schema: Record<string, unknown> = { ...coreSchema };
  const origin = new Map<string, string>();
  for (const key of Object.keys(coreSchema)) origin.set(key, "core");
  for (const plugin of config.plugins) {
    if (!plugin.schema) continue;
    for (const [key, value] of Object.entries(plugin.schema)) {
      const previous = origin.get(key);
      if (previous !== undefined) {
        throw AppBootError.schemaExportConflict({
          pluginId: plugin.id,
          schemaKey: key,
          previousOwner: previous,
        });
      }
      origin.set(key, plugin.id);
      schema[key] = value;
    }
  }

  // Reject plugin ids that collide with a core RPC namespace at boot, against
  // the light name set — so validation stays eager while the merge + heavy
  // router graph defer to `loadRpcHandler`. The `Object.hasOwn` arm also rejects
  // "constructor" (the one Object.prototype key matching the plugin-id pattern),
  // which would otherwise shadow a member of the merged router object.
  for (const pluginId of registry.rpcRouters.keys()) {
    if (
      CORE_RPC_NAMESPACES.has(pluginId) ||
      Object.hasOwn(Object.prototype, pluginId)
    ) {
      throw AppBootError.pluginIdCollidesWithCoreRpcNamespace({ pluginId });
    }
  }

  // Plugin REST resources share the flat `/_plumix/api/v1/` namespace. Reject,
  // at boot, any resource that overlaps a reserved core route or another
  // plugin's resource (overlap, not string equality — the matcher prefers
  // static segments, so a literal path could otherwise shadow a param route).
  const seenRestRoutes: { pluginId: string; route: RestRoute }[] = [];
  for (const resource of registry.restResources) {
    const route = { method: resource.method, path: resource.path };
    if (CORE_REST_ROUTES.some((core) => routesOverlap(route, core))) {
      throw AppBootError.restResourceShadowsCore({
        pluginId: resource.pluginId,
        method: resource.method,
        path: resource.path,
      });
    }
    const clash = seenRestRoutes.find((seen) =>
      routesOverlap(route, seen.route),
    );
    if (clash) {
      throw AppBootError.restResourcePathConflict({
        pluginId: resource.pluginId,
        otherPluginId: clash.pluginId,
        method: resource.method,
        path: resource.path,
      });
    }
    seenRestRoutes.push({ pluginId: resource.pluginId, route });
  }

  const passkey = resolvePasskeyConfig(config.auth.passkey);
  const oauth = config.auth.oauth;
  const oauthProviders: OAuthProviderSummary[] = oauth
    ? Object.entries(oauth.providers).map(([key, provider]) => ({
        key,
        label: provider.label,
      }))
    : [];
  const authenticator = config.auth.authenticator ?? defaultAuthenticator();
  const bootstrapAllowed = config.auth.bootstrapVia === "first-method-wins";

  // Aggregate `@plumix/blocks` core specs + plugin contributions into the
  // per-app registry. `createBlockRegistry`'s last-write-wins semantics
  // give plugins precedence over the core baseline.
  const pluginBlockSpecs = Array.from(registry.blockSpecs.values()).map(
    ({ spec }) => spec,
  );
  const blocks = createBlockRegistry([...coreBlocks, ...pluginBlockSpecs]);
  // Boot validation: every variation's `innerBlocks` is walked against
  // the committed registry. Unknown block names and undeclared attrs
  // throw structured errors here rather than producing render junk later.
  commitBlockVariations(blocks);

  const pluginMarkSpecs = Array.from(registry.markSpecs.values()).map(
    ({ spec }) => spec,
  );
  const marks: readonly MarkSpec[] = [...coreMarks, ...pluginMarkSpecs];

  const pluginShortcodeSpecs = Array.from(registry.shortcodeSpecs.values()).map(
    ({ spec }) => spec,
  );
  const shortcodes = assembleShortcodeRegistry(
    coreShortcodes,
    pluginShortcodeSpecs,
    config.theme.shortcodes ?? [],
  );

  const htmlAllowlist = buildHtmlAllowlist(
    blocks,
    config.blocks?.htmlAllowlist,
  );

  const document = await resolveDocumentManifest(hooks, config.theme.document);
  const templateDocuments = buildTemplateDocuments(
    config.theme.templates,
    document,
  );

  // Memoized so the heavy router module + handler construction happen once per
  // isolate, on the first RPC request — never on the public render cold path.
  let rpcHandler: Promise<RPCHandler<AppContext>> | undefined;
  const loadRpcHandler = (): Promise<RPCHandler<AppContext>> =>
    (rpcHandler ??= import("../rpc/build-handler.js").then((m) =>
      m.buildRpcHandler(registry.rpcRouters),
    ));

  let restHandler: Promise<RestDispatch> | undefined;
  const loadRestHandler = (): Promise<RestDispatch> =>
    (restHandler ??= import("../rest/build-handler.js").then((m) =>
      m.buildRestDispatcher(registry, config.api?.cors),
    ));

  return {
    config,
    hooks,
    plugins: registry,
    loadRpcHandler,
    loadRestHandler,
    origin: passkey.origin,
    devCsrfLocalhost: runtime.devCsrfLocalhost ?? false,
    passkey,
    sessionPolicy: config.auth.sessions ?? DEFAULT_SESSION_POLICY,
    authenticator,
    bootstrapAllowed,
    oauthProviders,
    schema,
    routeMap: compileRouteMap(registry),
    rawRoutes: registry.rawRoutes,
    capabilityResolver: createCapabilityResolver(registry),
    appContextExtensions,
    scheduledTasks: registry.scheduledTasks,
    blocks,
    marks,
    shortcodes,
    htmlAllowlist,
    document,
    assetManifest: runtime.assetManifest ?? {},
    templateDocuments,
  };
}

// Precompute the per-template merged document — theme-wide manifest
// (already through the `theme:document` filter chain) merged with each
// template's optional fragment. Each result is deep-frozen; the map
// itself is frozen too. The renderer looks up by matched template slot
// at request time and pays zero merge cost.
function buildTemplateDocuments(
  templates: Record<string, unknown>,
  themeDocument: DocumentManifest,
): ReadonlyMap<string, DocumentManifest> {
  const result = new Map<string, DocumentManifest>();
  for (const [slot, value] of Object.entries(templates)) {
    if (!isTemplate(value)) {
      // Legacy function form has no `document` field — render still
      // uses `app.document` via the fallback lookup, so we don't need
      // a per-slot entry.
      continue;
    }
    if (value.document === undefined) {
      // No fragment means the template wants the site-wide document
      // verbatim; skip the entry so the renderer falls back to
      // `app.document` (already deep-frozen).
      continue;
    }
    if (typeof value.document === "function") {
      // Resolved per-request by the renderer; nothing to precompute.
      continue;
    }
    const merged = mergeDocumentManifest(themeDocument, value.document);
    validateDocumentManifest(merged, slot);
    result.set(slot, deepFreezeManifest(merged));
  }
  return Object.freeze(result);
}

// Run the `theme:document` filter chain once at boot. Plugins spread + add
// onto a `{}` seed when the theme has no `document` of its own, so authors
// never need null-checks. The post-filter result is validated for shape
// (renderer can't recover from missing `link.rel` or empty `<script>`)
// then deep-frozen so per-request renders treat it as the immutable contract
// — a shallow freeze would still let a plugin mutate `app.document.meta`
// after boot and corrupt state across requests.
async function resolveDocumentManifest(
  hooks: HookRegistry,
  themeManifest: DocumentManifest | undefined,
): Promise<DocumentManifest> {
  const seed: DocumentManifest = themeManifest ?? {};
  const merged = await hooks.applyFilter("theme:document", seed);
  validateDocumentManifest(merged);
  return deepFreezeManifest(merged);
}

function deepFreezeManifest(manifest: DocumentManifest): DocumentManifest {
  manifest.link?.forEach((entry) => Object.freeze(entry));
  manifest.meta?.forEach((entry) => Object.freeze(entry));
  manifest.script?.forEach((entry) => Object.freeze(entry));
  if (manifest.link) Object.freeze(manifest.link);
  if (manifest.meta) Object.freeze(manifest.meta);
  if (manifest.script) Object.freeze(manifest.script);
  if (manifest.html) Object.freeze(manifest.html);
  if (manifest.body) Object.freeze(manifest.body);
  return Object.freeze(manifest);
}
