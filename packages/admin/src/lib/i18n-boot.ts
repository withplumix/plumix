import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

import { setI18nResolver } from "@plumix/core/validation";

import {
  ADMIN_CATALOGS,
  BLOCKS_CATALOGS,
  EDITOR_CATALOGS,
  PLUGIN_CATALOGS,
} from "./catalog-globs.js";
import { readManifest } from "./manifest.js";
import { createPluginCatalogLoader } from "./plugin-catalogs.js";

type CatalogMap = Record<string, () => Promise<{ messages: Messages }>>;

/** Injectable because the build-time globs can't be narrowed afterwards. */
export interface AdminCatalogs {
  readonly admin: CatalogMap;
  readonly plugins: CatalogMap;
  readonly editor: CatalogMap;
  readonly blocks: CatalogMap;
}

const BUNDLED_CATALOGS: AdminCatalogs = {
  admin: ADMIN_CATALOGS,
  plugins: PLUGIN_CATALOGS,
  editor: EDITOR_CATALOGS,
  blocks: BLOCKS_CATALOGS,
};

// Source locale: the language `descriptor.message` strings are authored
// in. When a user's locale isn't compiled (yet, or at all), we fall
// back here. Mirrors `lingui.config.ts:sourceLocale`.
const SOURCE_LOCALE = "en";

type PluginCatalogLoader = (pluginId: string, locale: string) => Promise<void>;

const NOOP_LOADER: PluginCatalogLoader = () => Promise.resolve();

/** A no-op until `bootI18n` installs the manifest-bound loader. */
export const pluginCatalogLoaderRef: { current: PluginCatalogLoader } = {
  current: NOOP_LOADER,
};

/**
 * Unknown locales fall back to the source locale. Never throws: a missing
 * catalog leaves Lingui on descriptor messages.
 */
export async function bootI18n(
  catalogs: AdminCatalogs = BUNDLED_CATALOGS,
): Promise<void> {
  const tag = document.documentElement.lang.toLowerCase().split("-")[0] ?? "";
  const requested = catalogs.admin[`../../locales/${tag}.mjs`];
  const fallback = catalogs.admin[`../../locales/${SOURCE_LOCALE}.mjs`];
  const adminLoader = requested ?? fallback;
  if (!adminLoader) return;
  const locale = requested ? tag : SOURCE_LOCALE;

  const adminMessages = (await adminLoader()).messages;
  const workspaceMessages = await loadWorkspacePluginCatalogs(
    catalogs.plugins,
    locale,
  );
  const editorMessages = await loadSourceFallbackCatalog(
    catalogs.editor,
    "../../../admin-editor/locales/",
    locale,
  );
  const blocksMessages = await loadSourceFallbackCatalog(
    catalogs.blocks,
    "../../../core/locales/blocks-",
    locale,
  );
  // Admin chrome last so it wins on collision.
  i18n.load(locale, {
    ...blocksMessages,
    ...editorMessages,
    ...workspaceMessages,
    ...adminMessages,
  });
  i18n.activate(locale);

  // Server bundles skip this and fall back to `descriptor.message`.
  setI18nResolver((d) => i18n._(d));

  // Third-party plugins: manifest-driven runtime fetch + merge.
  const pluginI18n = readManifest().pluginI18n ?? {};
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

// Unlike plugins, an uncompiled locale reads English rather than raw ids.
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

async function loadWorkspacePluginCatalogs(
  plugins: CatalogMap,
  locale: string,
): Promise<Messages> {
  const merged: Messages = {};
  for (const [path, loader] of Object.entries(plugins)) {
    // `../../../plugins/<id>/locales/<locale>.mjs` — match the
    // requested locale's filename. No fallback at the plugin layer;
    // missing translations fall through to `descriptor.message`.
    if (!path.endsWith(`/locales/${locale}.mjs`)) continue;
    const mod = await loader();
    Object.assign(merged, mod.messages);
  }
  return merged;
}
