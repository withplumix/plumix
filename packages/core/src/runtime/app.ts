import { RPCHandler } from "@orpc/server/fetch";

import type { ResolvedPasskeyConfig } from "../auth/passkey/config.js";
import type { SessionPolicy } from "../auth/sessions.js";
import type { PlumixConfig } from "../config.js";
import type { AppContext } from "../context/app.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import * as coreSchema from "../db/schema/index.js";
import { HookRegistry } from "../hooks/registry.js";
import { installPlugins } from "../plugin/register.js";
import { appRouter } from "../rpc/router.js";

export interface PlumixApp {
  readonly config: PlumixConfig;
  readonly hooks: HookRegistry;
  readonly plugins: PluginRegistry;
  readonly rpcHandler: RPCHandler<AppContext>;
  readonly passkey: ResolvedPasskeyConfig;
  readonly sessionPolicy: SessionPolicy;
  readonly schema: Record<string, unknown>;
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

  return {
    config,
    hooks,
    plugins: registry,
    rpcHandler: new RPCHandler(appRouter),
    passkey: resolvePasskeyConfig(config.auth.passkey),
    sessionPolicy: config.auth.sessions ?? DEFAULT_SESSION_POLICY,
    schema,
  };
}
