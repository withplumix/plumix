import { RPCHandler } from "@orpc/server/fetch";

import type { PasskeyConfig, ResolvedPasskeyConfig } from "../auth/passkey/config.js";
import type { SessionPolicy } from "../auth/sessions.js";
import type { PlumixConfig } from "../config.js";
import type { AppContext } from "../context/app.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import { HookRegistry as HookRegistryImpl } from "../hooks/registry.js";
import { installPlugins } from "../plugin/register.js";
import { appRouter } from "../rpc/router.js";

export interface PlumixAppOptions {
  readonly passkey: PasskeyConfig;
  readonly sessionPolicy?: SessionPolicy;
}

export interface PlumixApp {
  readonly config: PlumixConfig;
  readonly hooks: HookRegistry;
  readonly plugins: PluginRegistry;
  readonly rpcHandler: RPCHandler<AppContext>;
  readonly passkey: ResolvedPasskeyConfig;
  readonly sessionPolicy: SessionPolicy;
}

export async function buildApp(
  config: PlumixConfig,
  options: PlumixAppOptions,
): Promise<PlumixApp> {
  const hooks = new HookRegistryImpl();
  const { registry } = await installPlugins({ hooks, plugins: config.plugins });

  const rpcHandler = new RPCHandler(appRouter);

  return {
    config,
    hooks,
    plugins: registry,
    rpcHandler,
    passkey: resolvePasskeyConfig(options.passkey),
    sessionPolicy: options.sessionPolicy ?? DEFAULT_SESSION_POLICY,
  };
}
