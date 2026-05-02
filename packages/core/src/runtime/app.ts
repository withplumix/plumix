import { RPCHandler } from "@orpc/server/fetch";

import type { OAuthProviderKey } from "../auth/oauth/types.js";
import type { ResolvedPasskeyConfig } from "../auth/passkey/config.js";
import type { CapabilityResolver } from "../auth/rbac.js";
import type { SessionPolicy } from "../auth/sessions.js";
import type { PlumixConfig } from "../config.js";
import type { AppContext } from "../context/app.js";
import type { PluginRegistry, RegisteredRawRoute } from "../plugin/manifest.js";
import type { RouteRule } from "../route/intent.js";
import { OAUTH_PROVIDER_KEYS } from "../auth/oauth/types.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { createCapabilityResolver } from "../auth/rbac.js";
import { DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import * as coreSchema from "../db/schema/index.js";
import { HookRegistry } from "../hooks/registry.js";
import { CORE_RPC_NAMESPACES } from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";
import { compileRouteMap } from "../route/compile.js";
import { appRouter } from "../rpc/router.js";

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
  /** Provider keys with credentials configured. Empty when oauth() wasn't passed. */
  readonly oauthProviders: readonly OAuthProviderKey[];
  readonly schema: Record<string, unknown>;
  /**
   * Sorted route map compiled once at `buildApp` from the plugin registry.
   * Module-scoped module-less equivalent: CF Worker isolates reuse this
   * across requests without re-derivation.
   */
  readonly routeMap: readonly RouteRule[];
  readonly rawRoutes: readonly RegisteredRawRoute[];
  readonly capabilityResolver: CapabilityResolver;
}

export async function buildApp(config: PlumixConfig): Promise<PlumixApp> {
  const hooks = new HookRegistry();
  const { registry } = await installPlugins({ hooks, plugins: config.plugins });

  const schema: Record<string, unknown> = { ...coreSchema };
  const origin = new Map<string, string>();
  for (const key of Object.keys(coreSchema)) origin.set(key, "core");
  for (const plugin of config.plugins) {
    if (!plugin.schema) continue;
    for (const [key, value] of Object.entries(plugin.schema)) {
      const previous = origin.get(key);
      if (previous !== undefined) {
        throw new Error(
          `Plugin "${plugin.id}" redefines schema export "${key}" (already defined by "${previous}")`,
        );
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
      throw new Error(
        `Plugin id "${pluginId}" collides with a core RPC namespace ` +
          `at buildApp; rename the plugin.`,
      );
    }
    if (pluginId in appRouter) {
      throw new Error(
        `Plugin id "${pluginId}" collides with the core RPC router key ` +
          `at buildApp; rename the plugin.`,
      );
    }
    mergedRouter[pluginId] = pluginRouter;
  }

  const passkey = resolvePasskeyConfig(config.auth.passkey);
  const oauth = config.auth.oauth;
  const oauthProviders = oauth
    ? OAUTH_PROVIDER_KEYS.filter((key) => oauth.providers[key])
    : [];
  return {
    config,
    hooks,
    plugins: registry,
    rpcHandler: new RPCHandler(mergedRouter as unknown as typeof appRouter),
    origin: passkey.origin,
    passkey,
    sessionPolicy: config.auth.sessions ?? DEFAULT_SESSION_POLICY,
    oauthProviders,
    schema,
    routeMap: compileRouteMap(registry),
    rawRoutes: registry.rawRoutes,
    capabilityResolver: createCapabilityResolver(registry),
  };
}
