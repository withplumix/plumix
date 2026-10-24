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
   * Required: plugins read it as `ctx.theme`, so registrations a plugin makes
   * from the theme are missing from the manifest without it.
   */
  readonly theme: ThemeDescriptor;
  /**
   * The framework routes the site keeps, seeded into the registry the way
   * `buildApp` seeds its own. Required for the same reason as `theme`.
   */
  readonly routes: PlumixConfig["routes"];
  /** The config's roles, seeded the way `buildApp` seeds them. */
  readonly roles?: PlumixConfig["roles"];
}

/**
 * A plugin that throws on setup fails the build. Runs on every dev config
 * change, so `setup()` and `afterSetup()` must stay free of IO and safe to
 * repeat.
 */
export async function computeManifestAndRegistry(
  plugins: PluginDescriptors,
  options: ManifestBuildOptions,
): Promise<{ manifest: PlumixManifest; registry: PluginRegistry }> {
  const hooks = new HookRegistry();
  const { registry } = await installPlugins({
    hooks,
    plugins,
    registry: createPluginRegistry(options.routes, options.roles),
    theme: options.theme,
  });
  // Forward plugin descriptors so `buildManifest` can emit
  // `pluginI18n` URL maps for plugins declaring an `i18n` slot
  // (slice 17 #697 runtime catalog registry).
  return {
    manifest: buildManifest(registry, {
      ...options,
      allowedBlocks: options.theme.allowedBlocks,
      allowCustomStyles: options.theme.allowCustomStyles,
      plugins,
    }),
    registry,
  };
}
