import type { AnyPluginDescriptor } from "../config.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { MutablePluginRegistry, PluginRegistry } from "./manifest.js";
import type { ContextExtensionEntry } from "./provides-context.js";
import { assertValidPluginId } from "./define.js";
import { PluginDefinitionError } from "./errors.js";
import { createPluginRegistry } from "./manifest.js";
import { createPluginProvidesContext } from "./provides-context.js";
import { createPluginSetupContext } from "./setup-context.js";

export interface PluginInstallResult {
  readonly hooks: HookRegistry;
  readonly registry: PluginRegistry;
  readonly themeExtensions: ReadonlyMap<string, ContextExtensionEntry>;
  /**
   * Plugin-contributed AppContext helpers from
   * `provides(ctx).extendAppContext(...)`. Runtime adapters merge these
   * onto each per-request `AppContext` so any handler — RPC, route,
   * scheduled, or hook listener via `requestStore.getStore()` — reads
   * them as `ctx.<key>`.
   */
  readonly appContextExtensions: ReadonlyMap<string, ContextExtensionEntry>;
}

interface InstallPluginsArgs {
  readonly hooks: HookRegistry;
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly registry?: MutablePluginRegistry;
}

export async function installPlugins({
  hooks,
  plugins,
  registry = createPluginRegistry(),
}: InstallPluginsArgs): Promise<PluginInstallResult> {
  const seenIds = new Set<string>();
  for (const descriptor of plugins) {
    // Re-check in case the descriptor was hand-rolled.
    assertValidPluginId(descriptor.id);
    if (seenIds.has(descriptor.id)) {
      throw PluginDefinitionError.duplicatePluginIdInConfig({
        pluginId: descriptor.id,
      });
    }
    seenIds.add(descriptor.id);
  }

  const pluginExtensions = new Map<string, ContextExtensionEntry>();
  const themeExtensions = new Map<string, ContextExtensionEntry>();
  const appContextExtensions = new Map<string, ContextExtensionEntry>();
  for (const descriptor of plugins) {
    if (!descriptor.provides) continue;
    const providesCtx = createPluginProvidesContext({
      pluginId: descriptor.id,
      pluginExtensions,
      themeExtensions,
      appExtensions: appContextExtensions,
    });
    await descriptor.provides(providesCtx);
  }

  const mergedPluginExtensions = new Map<string, unknown>();
  for (const [key, entry] of pluginExtensions) {
    mergedPluginExtensions.set(key, entry.value);
  }

  for (const descriptor of plugins) {
    const ctx = createPluginSetupContext({
      pluginId: descriptor.id,
      hooks,
      registry,
      extensions: mergedPluginExtensions,
    });
    await descriptor.setup(ctx, undefined);
  }

  return { hooks, registry, themeExtensions, appContextExtensions };
}
