import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";

import type { BlockRegistry, HtmlAllowlist, MarkSpec } from "@plumix/blocks";
import {
  buildHtmlAllowlist,
  commitBlockVariations,
  coreBlocks,
  coreMarks,
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
import {
  CORE_RPC_NAMESPACES,
  createPluginRegistry,
} from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";
import { compileRouteMap } from "../route/compile.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { appRouter } from "../rpc/router.js";
import { registerCoreTemplateDeps } from "../template-deps-core.js";
import { isTemplate } from "../template.js";
import { ThemeRegistrationError } from "../theme-errors.js";
import { validateDocumentManifest } from "../theme.js";
import { AppBootError } from "./errors.js";

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
  readonly rpcHandler: RPCHandler<AppContext>;
  /**
   * Canonical site origin (e.g. `https://cms.example.com`). Sourced from
   * the passkey config for now since that's the only place it lives in
   * user-facing config; exposed at the top level so CSRF / admin / future
   * features don't have to reach into `passkey.*` to learn it.
   */
  readonly origin: string;
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
}

export async function buildApp(
  config: PlumixConfig,
  runtime: RuntimeContext = {},
): Promise<PlumixApp> {
  const hooks = new HookRegistry();
  registerCoreAdminBarContributors(hooks);
  const seededRegistry = createPluginRegistry();
  registerCoreLookupAdapters(seededRegistry);
  registerCoreTemplateDeps(seededRegistry);
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

  // The cast matches oRPC's runtime dispatch model: routers are opaque
  // property-key lookups, so plugin sub-routers don't need static typing.
  const mergedRouter = { ...appRouter } as Record<string, unknown>;
  for (const [pluginId, pluginRouter] of registry.rpcRouters) {
    if (CORE_RPC_NAMESPACES.has(pluginId)) {
      throw AppBootError.pluginIdCollidesWithCoreRpcNamespace({ pluginId });
    }
    if (pluginId in appRouter) {
      throw AppBootError.pluginIdCollidesWithCoreRpcRouter({ pluginId });
    }
    mergedRouter[pluginId] = pluginRouter;
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

  const htmlAllowlist = buildHtmlAllowlist(
    blocks,
    config.blocks?.htmlAllowlist,
  );

  const document = await resolveDocumentManifest(hooks, config.theme.document);
  const templateDocuments = buildTemplateDocuments(
    config.theme.templates,
    document,
  );

  return {
    config,
    hooks,
    plugins: registry,
    rpcHandler: new RPCHandler(mergedRouter as unknown as typeof appRouter, {
      plugins: [new ResponseHeadersPlugin()],
    }),
    origin: passkey.origin,
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
