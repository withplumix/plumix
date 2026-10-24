import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

import type {
  AdminCatalogLocales,
  AdminCatalogSet,
  PluginI18nManifest,
} from "@plumix/core/manifest";
import { setI18nResolver } from "@plumix/core/validation";

import {
  ADMIN_CATALOGS,
  BLOCKS_CATALOGS,
  EDITOR_CATALOGS,
} from "./catalog-globs.js";
import { CATALOG_SET_PREFIXES } from "./catalog-sets.js";
import { SOURCE_LOCALE } from "./constants.js";
import { createPluginCatalogLoader } from "./plugin-catalogs.js";

type CatalogMap = Record<string, () => Promise<{ messages: Messages }>>;

/** Injectable because the build-time globs can't be narrowed afterwards. */
export interface AdminCatalogs {
  readonly admin: CatalogMap;
  readonly editor: CatalogMap;
  readonly blocks: CatalogMap;
}

const BUNDLED_CATALOGS: AdminCatalogs = {
  admin: ADMIN_CATALOGS,
  editor: EDITOR_CATALOGS,
  blocks: BLOCKS_CATALOGS,
};

type PluginCatalogLoader = (pluginId: string, locale: string) => Promise<void>;

const NOOP_LOADER: PluginCatalogLoader = () => Promise.resolve();

/** A no-op until `bootI18n` installs the manifest-bound loader. */
export const pluginCatalogLoaderRef: { current: PluginCatalogLoader } = {
  current: NOOP_LOADER,
};

interface BootI18nInput {
  /** The page's `<html lang>`: the enabled locale. */
  readonly lang: string;
  /** The manifest's plugin catalogs. */
  readonly pluginI18n?: PluginI18nManifest;
  /** The manifest's catalog locale for each enabled locale, per set. */
  readonly catalogLocales?: AdminCatalogLocales;
  readonly catalogs?: AdminCatalogs;
}

/**
 * Activates the enabled locale, for `Intl` formatting, with each set's
 * catalog locale's messages. An unprojected locale reads its own catalog.
 * Never throws.
 */
export async function bootI18n({
  lang,
  pluginI18n = {},
  catalogLocales,
  catalogs = BUNDLED_CATALOGS,
}: BootI18nInput): Promise<void> {
  const locale = lang || SOURCE_LOCALE;
  const catalogLocaleOf = (set: AdminCatalogSet): string =>
    catalogLocales?.[set][locale] ?? locale;

  const adminMessages = await loadSourceFallbackCatalog(
    catalogs.admin,
    CATALOG_SET_PREFIXES.admin,
    catalogLocaleOf("admin"),
  );
  const editorMessages = await loadSourceFallbackCatalog(
    catalogs.editor,
    CATALOG_SET_PREFIXES.editor,
    catalogLocaleOf("editor"),
  );
  const blocksMessages = await loadSourceFallbackCatalog(
    catalogs.blocks,
    CATALOG_SET_PREFIXES.blocks,
    catalogLocaleOf("blocks"),
  );
  // Admin chrome last so it wins on collision.
  i18n.load(locale, {
    ...blocksMessages,
    ...editorMessages,
    ...adminMessages,
  });
  i18n.activate(locale);

  // Server bundles skip this and fall back to `descriptor.message`.
  setI18nResolver((d) => i18n._(d));

  // Plugins: manifest-driven runtime fetch + merge.
  pluginCatalogLoaderRef.current = createPluginCatalogLoader({
    manifest: pluginI18n,
  });
  // Fan out fetches in parallel. The loader never rejects (failures
  // swallow inside), so a broken plugin can't block the mount.
  await Promise.all(
    Object.keys(pluginI18n).map((id) =>
      pluginCatalogLoaderRef.current(id, locale),
    ),
  );
}

/** Unlike plugins, an uncompiled locale reads English rather than raw ids. */
async function loadSourceFallbackCatalog(
  catalogs: CatalogMap,
  prefix: string,
  locale: string,
): Promise<Messages> {
  const loader =
    catalogs[`${prefix}${locale}.mjs`] ??
    catalogs[`${prefix}${SOURCE_LOCALE}.mjs`];
  if (!loader) return {};
  return (await loader()).messages;
}
