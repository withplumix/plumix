import type { AnyPluginDescriptor } from "../config.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { ContextExtensionEntry } from "./context.js";
import type { MutablePluginRegistry, PluginRegistry } from "./manifest.js";
import {
  createPluginProvidesContext,
  createPluginSetupContext,
} from "./context.js";
import { assertValidPluginId } from "./define.js";
import { createPluginRegistry } from "./manifest.js";

export interface PluginInstallResult {
  readonly hooks: HookRegistry;
  readonly registry: PluginRegistry;
  /**
   * Theme-context extensions collected from every plugin's `provides`
   * phase. Themes don't ship in week 1; the runtime stores these so the
   * `defineTheme` consumer can read them once themes land. Entries
   * carry the providing plugin id for diagnostics.
   */
  readonly themeExtensions: ReadonlyMap<string, ContextExtensionEntry>;
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

  // Phase 1 — collect context extensions. Maps are shared across every
  // plugin's provides ctx so collisions surface globally with both
  // providing plugin ids in the error message.
  const pluginExtensions = new Map<string, ContextExtensionEntry>();
  const themeExtensions = new Map<string, ContextExtensionEntry>();
  for (const descriptor of plugins) {
    if (!descriptor.provides) continue;
    const providesCtx = createPluginProvidesContext({
      pluginId: descriptor.id,
      pluginExtensions,
      themeExtensions,
    });
    await descriptor.provides(providesCtx);
  }

  // Build the merged extensions view passed to every setup ctx — the
  // shape `createPluginSetupContext` consumes is `key → value`, the
  // pluginId attribution stays on the source map.
  const mergedPluginExtensions = new Map<string, unknown>();
  for (const [key, entry] of pluginExtensions) {
    mergedPluginExtensions.set(key, entry.value);
  }

  // Phase 2 — run setup with the merged context.
  for (const descriptor of plugins) {
    const ctx = createPluginSetupContext({
      pluginId: descriptor.id,
      hooks,
      registry,
      extensions: mergedPluginExtensions,
    });
    await descriptor.setup(ctx, undefined);
  }

  return { hooks, registry, themeExtensions };
}
