import type { BlockSpec, ThemeBreakpoints, ThemeTokens } from "@plumix/blocks";
import type {
  collectNamedTemplates,
  PluginRegistry,
  PlumixManifest,
  ResolvedI18n,
  ThemeDescriptor,
} from "@plumix/core";
import { buildManifest, HookRegistry, installPlugins } from "@plumix/core";

import { isAdminBundledPlugin } from "./plugin-catalog-resolve.js";

type PluginDescriptors = Parameters<typeof installPlugins>[0]["plugins"];

export interface ManifestBuildOptions {
  readonly tokens?: ThemeTokens;
  readonly breakpoints?: ThemeBreakpoints;
  readonly namedTemplates?: ReturnType<typeof collectNamedTemplates>;
  readonly blocks?: readonly BlockSpec[];
  readonly i18n?: ResolvedI18n;
  /**
   * The site's theme, handed to plugins the way the runtime hands it over.
   * Required, because the whole SEO settings page — and every other
   * registration a plugin defers to `theme:ready` — is missing from the
   * manifest without it, which is the drift this function exists to prevent.
   */
  readonly theme: ThemeDescriptor;
  readonly projectRoot: string;
  /** Where `@plumix/admin` keeps the plugin catalogs it baked in, if anywhere. */
  readonly bundledPluginsDir: string | null;
}

/**
 * Run plugin `setup()` callbacks into a throwaway hook registry just to capture
 * what's been registered.
 *
 * Hooks wired up here are discarded — the manifest plus the populated registry
 * are everything downstream needs (manifest → wire payload, registry →
 * admin-plugin-bundle's auto-register synthesis). If a plugin throws on setup
 * we surface it as-is: a broken config should fail the build, not silently ship
 * an empty manifest. Note: this runs on every dev config-file change, so
 * plugins should keep `setup()` — and the `theme:ready` handler below — free of
 * IO and of anything a repeat call would compound.
 */
export async function computeManifestAndRegistry(
  plugins: PluginDescriptors,
  options: ManifestBuildOptions,
): Promise<{ manifest: PlumixManifest; registry: PluginRegistry }> {
  const hooks = new HookRegistry();
  const { registry } = await installPlugins({ hooks, plugins });
  // The same handover `buildApp` makes before it reads any registry. A plugin
  // whose registrations are derived from what every *other* plugin registered —
  // which entry types carry the SEO box, which scopes the sitemap enumerates —
  // can only make them once the registry is complete, so it subscribes to
  // `theme:ready`. A manifest built without firing it would ship the admin an
  // empty meta-box list while the running worker had one, which is exactly the
  // drift `buildManifest` exists to prevent.
  await hooks.doAction("theme:ready", options.theme);
  // Caveat on the skip below: the glob that bakes catalogs in runs when
  // @plumix/admin is built, this predicate runs when a site is configured.
  // If `@plumix/admin`'s dist is stale — a workspace plugin added since it
  // was last built — the link resolves but the glob never saw it, and the
  // plugin's strings fall back to `descriptor.message` silently. Rebuild
  // @plumix/admin to refresh. The info line below makes that debuggable.
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
  if (adminBundledPluginIds.size > 0) {
    console.info(
      `[plumix] skipping pluginI18n URLs for workspace-bundled plugins (admin's import.meta.glob is expected to cover): ${Array.from(adminBundledPluginIds).join(", ")}`,
    );
  }
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
