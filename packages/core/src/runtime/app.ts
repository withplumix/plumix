import { RPCHandler } from "@orpc/server/fetch";

import type {
  BlockComponent,
  BlockRegistry,
  MarkComponent,
  MarkRegistry,
} from "@plumix/blocks";
import {
  coreBlocks,
  coreMarks,
  mergeBlockRegistry,
  mergeMarkRegistry,
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
import type {
  ThemeDescriptor,
  ThemeSetupContext,
  ThemeSetupContextBase,
} from "../theme.js";
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
   * contributions from `ctx.registerBlock`. Component lazy refs on
   * each spec are awaited once during `buildApp`, so the SSR walker
   * reads `app.blocks.get(name).component` synchronously per request.
   *
   * Theme block overrides are merged in by the (forthcoming) theme
   * pipeline; v1 of the foundation slice ships the core + plugin
   * layers only.
   */
  readonly blocks: BlockRegistry;
  /**
   * Merged mark registry: the 13 core marks from `@plumix/blocks` +
   * plugin contributions from `ctx.registerMark`. Same shape and
   * resolution model as `app.blocks`.
   */
  readonly marks: MarkRegistry;
}

export async function buildApp(config: PlumixConfig): Promise<PlumixApp> {
  const hooks = new HookRegistry();
  const seededRegistry = createPluginRegistry();
  registerCoreLookupAdapters(seededRegistry);
  const { registry, themeExtensions, appContextExtensions } =
    await installPlugins({
      hooks,
      plugins: config.plugins,
      registry: seededRegistry,
    });

  // Themes run after plugins so plugins' `provides` callbacks have already
  // populated `themeExtensions`. Each theme's setup runs in declared
  // order; ids are unique across `config.themes`.
  const themeIds = new Set<string>();
  for (const theme of config.themes) {
    if (themeIds.has(theme.id)) {
      throw AppBootError.duplicateThemeId({ themeId: theme.id });
    }
    themeIds.add(theme.id);
    if (theme.setup) {
      const ctx = buildThemeSetupContext(theme.id, themeExtensions);
      await theme.setup(ctx);
    }
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

  // Seed the per-app block registry from `@plumix/blocks` core specs +
  // plugin contributions. The block walker reads attribute schemas
  // referenced by name (`registerFieldType`); pass the resolved field-type
  // set so `unknown_attribute_type` errors surface here instead of at
  // render time. Theme overrides flatten across `config.themes` with
  // later themes winning per-name — same precedence as `marks` below.
  const pluginBlockContributions = Array.from(registry.blockSpecs.values()).map(
    ({ spec, registeredBy }) => ({ spec, pluginId: registeredBy }),
  );
  const fieldTypeNames = new Set<string>(registry.fieldTypes.keys());
  const { overrides: blockOverrides, themeId: blockThemeId } =
    collectThemeOverrides(config.themes, (theme) => theme.blocks);
  const blocks = await mergeBlockRegistry({
    core: coreBlocks,
    plugins: pluginBlockContributions,
    themeOverrides: blockOverrides,
    themeId: blockThemeId,
    fieldTypes: fieldTypeNames,
  });

  const pluginMarkContributions = Array.from(registry.markSpecs.values()).map(
    ({ spec, registeredBy }) => ({ spec, pluginId: registeredBy }),
  );
  const { overrides: markOverrides, themeId: markThemeId } =
    collectThemeOverrides(config.themes, (theme) => theme.marks);
  const marks = await mergeMarkRegistry({
    core: coreMarks,
    plugins: pluginMarkContributions,
    themeOverrides: markOverrides,
    themeId: markThemeId,
  });

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
  };
}

/**
 * Flatten per-name component overrides from every theme in declaration
 * order. Later themes win when names collide, mirroring CSS cascade
 * intuition (the most-recently-applied theme has the final say). The
 * reported `themeId` is the last theme that contributed any override —
 * used by `mergeMarkRegistry` / `mergeBlockRegistry` only to attribute
 * `themeOverrideUnknownName` errors.
 */
function collectThemeOverrides<C extends BlockComponent | MarkComponent>(
  themes: readonly ThemeDescriptor[],
  pick: (theme: ThemeDescriptor) => Readonly<Record<string, C>> | undefined,
): { overrides: Record<string, C>; themeId: string | null } {
  const overrides: Record<string, C> = {};
  let themeId: string | null = null;
  for (const theme of themes) {
    const layer = pick(theme);
    if (!layer) continue;
    for (const [name, component] of Object.entries(layer)) {
      overrides[name] = component;
      themeId = theme.id;
    }
  }
  return { overrides, themeId };
}

function buildThemeSetupContext(
  id: string,
  themeExtensions: ReadonlyMap<string, ContextExtensionEntry>,
): ThemeSetupContext {
  // `satisfies` so adding a field to `ThemeSetupContextBase` later forces
  // this builder to update — a plain `Record<string, unknown>` cast would
  // silently produce a context missing the new field.
  const base = { id } satisfies ThemeSetupContextBase;
  const ctx: Record<string, unknown> = { ...base };
  for (const [key, entry] of themeExtensions) {
    ctx[key] = entry.value;
  }
  return ctx as unknown as ThemeSetupContext;
}
