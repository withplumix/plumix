import { RPCHandler } from "@orpc/server/fetch";

import type {
  BlockRegistry,
  HtmlAllowlist,
  MarkSpec,
  ThemeTokens,
} from "@plumix/blocks";
import {
  buildHtmlAllowlist,
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
import { defaultAuthenticator } from "../auth/authenticator.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { createCapabilityResolver } from "../auth/rbac.js";
import { DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import * as coreSchema from "../db/schema/index.js";
import { HookRegistry } from "../hooks/registry.js";
import {
  CORE_RPC_NAMESPACES,
  createPluginRegistry,
} from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";
import { compileRouteMap } from "../route/compile.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { appRouter } from "../rpc/router.js";
import { ThemeRegistrationError } from "../theme-errors.js";
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
   * Active theme's design tokens, flattened across `config.themes`
   * with later themes winning per-group. `undefined` when no theme
   * declared `tokens` — the universal Style slot in `renderBlockTree`
   * then has no token table to resolve through.
   */
  readonly themeTokens: ThemeTokens | undefined;
}

export async function buildApp(config: PlumixConfig): Promise<PlumixApp> {
  const hooks = new HookRegistry();
  const seededRegistry = createPluginRegistry();
  registerCoreLookupAdapters(seededRegistry);
  const { registry, appContextExtensions } = await installPlugins({
    hooks,
    plugins: config.plugins,
    registry: seededRegistry,
  });

  if (config.theme && !config.theme.templates.index) {
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
  // give plugins precedence over the core baseline; theme-level overrides
  // are not part of the v2 surface (themes contribute through tokens +
  // `config.themes[].setup`, not through component swaps).
  const pluginBlockSpecs = Array.from(registry.blockSpecs.values()).map(
    ({ spec }) => spec,
  );
  const blocks = createBlockRegistry([...coreBlocks, ...pluginBlockSpecs]);

  const pluginMarkSpecs = Array.from(registry.markSpecs.values()).map(
    ({ spec }) => spec,
  );
  const marks: readonly MarkSpec[] = [...coreMarks, ...pluginMarkSpecs];

  const htmlAllowlist = buildHtmlAllowlist(
    blocks,
    config.blocks?.htmlAllowlist,
  );

  const themeTokens = config.theme?.tokens;

  return {
    config,
    hooks,
    plugins: registry,
    rpcHandler: new RPCHandler(mergedRouter as unknown as typeof appRouter),
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
    themeTokens,
  };
}

