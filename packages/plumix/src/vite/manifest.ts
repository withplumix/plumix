import type {
  AdminArea,
  collectNamedTemplates,
  ConfiguredSlots,
  PluginRegistry,
  PlumixConfig,
  PlumixManifest,
  ResolvedI18n,
  ThemeDescriptor,
} from "@plumix/core";
import type {
  BlockSpec,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/core/blocks";
import {
  buildManifest,
  createPluginRegistry,
  HookRegistry,
  installPlugins,
} from "@plumix/core";

import { isAdminBundledPlugin } from "./plugin-catalog-resolve.js";

type PluginDescriptors = Parameters<typeof installPlugins>[0]["plugins"];

export interface ManifestBuildOptions {
  readonly tokens?: ThemeTokens;
  readonly breakpoints?: ThemeBreakpoints;
  readonly namedTemplates?: ReturnType<typeof collectNamedTemplates>;
  readonly blocks?: readonly BlockSpec[];
  readonly i18n?: ResolvedI18n;
  readonly configuredSlots?: ConfiguredSlots;
  /**
   * What the runtime adapter refuses; see `RuntimeAdapter.refusedAdminAreas`.
   */
  readonly refusedAdminAreas?: readonly AdminArea[];
  /**
   * Required: registrations a plugin makes from `theme:ready` are missing from
   * the manifest without it.
   */
  readonly theme: ThemeDescriptor;
  /**
   * The framework routes the site keeps, seeded into the registry the way
   * `buildApp` seeds its own. Required for the same reason as `theme`.
   */
  readonly routes: PlumixConfig["routes"];
  readonly projectRoot: string;
  /**
   * Where `@plumix/admin` keeps the plugin catalogs it baked in, if anywhere.
   */
  readonly bundledPluginsDir: string | null;
}

/**
 * A plugin that throws on setup fails the build. Runs on every dev config
 * change, so `setup()`, `afterSetup()` and `theme:ready` handlers must stay
 * free of IO and safe to repeat.
 */
export async function computeManifestAndRegistry(
  plugins: PluginDescriptors,
  options: ManifestBuildOptions,
): Promise<{ manifest: PlumixManifest; registry: PluginRegistry }> {
  const hooks = new HookRegistry();
  const { registry } = await installPlugins({
    hooks,
    plugins,
    registry: createPluginRegistry(options.routes),
  });
  // Plugins can still register from the theme they're handed; skipping this
  // would ship the admin a shorter list than the running worker has.
  await hooks.doAction("theme:ready", options.theme);
  // A stale `@plumix/admin` dist misses a workspace plugin added since, whose
  // strings then silently fall back to English. Rebuild @plumix/admin to
  // refresh.
  const adminBundledPluginIds = new Set(
    plugins
      .filter(
        (p) =>
          p.i18n !== undefined &&
          isAdminBundledPlugin({
            pluginId: p.id,
            projectRoot: options.projectRoot,
            bundledPluginsDir: options.bundledPluginsDir,
          }),
      )
      .map((p) => p.id),
  );
  // Forward plugin descriptors so `buildManifest` can emit
  // `pluginI18n` URL maps for plugins declaring an `i18n` slot
  // (slice 17 #697 runtime catalog registry).
  return {
    manifest: buildManifest(registry, {
      ...options,
      plugins,
      adminBundledPluginIds,
    }),
    registry,
  };
}
