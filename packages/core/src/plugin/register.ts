import type { AnyPluginDescriptor } from "../config.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { MutablePluginRegistry, PluginRegistry } from "./manifest.js";
import { createPluginSetupContext } from "./context.js";
import { assertValidPluginId } from "./define.js";
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
      throw new Error(
        `Plugin id "${descriptor.id}" appears more than once in ` +
          `config.plugins — each plugin id must be unique.`,
      );
    }
    seenIds.add(descriptor.id);
  }
  for (const descriptor of plugins) {
    const ctx = createPluginSetupContext({
      pluginId: descriptor.id,
      hooks,
      registry,
    });
    await descriptor.setup(ctx, undefined);
  }
  return { hooks, registry };
}
