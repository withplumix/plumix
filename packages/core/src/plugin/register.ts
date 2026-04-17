import type { AnyPluginDescriptor } from "../config.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { MutablePluginRegistry, PluginRegistry } from "./manifest.js";
import { createPluginSetupContext } from "./context.js";
import { createPluginRegistry } from "./manifest.js";

export interface PluginInstallResult {
  readonly hooks: HookRegistry;
  readonly registry: PluginRegistry;
}

interface InstallPluginsArgs {
  readonly hooks: HookRegistry;
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly registry?: MutablePluginRegistry;
}

/**
 * Run every plugin's `setup(ctx, config)` once, at app build time.
 * Collects the manifest of post types / taxonomies / meta / capabilities and
 * registers all filters/actions with the shared hook registry.
 */
export async function installPlugins({
  hooks,
  plugins,
  registry = createPluginRegistry(),
}: InstallPluginsArgs): Promise<PluginInstallResult> {
  for (const descriptor of plugins) {
    const ctx = createPluginSetupContext({
      pluginId: descriptor.id,
      hooks,
      registry,
    });
    // Plugin configs are opaque at the framework level — each plugin supplies
    // its own TConfig. `undefined` is the common case for zero-config plugins.
    await descriptor.setup(ctx, undefined as never);
  }
  return { hooks, registry };
}
