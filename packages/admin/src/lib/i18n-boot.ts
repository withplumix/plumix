import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

import { setI18nResolver } from "@plumix/core/validation";

import { readManifest } from "./manifest.js";
import { createPluginCatalogLoader } from "./plugin-catalogs.js";

// Admin's own compiled catalogs. Vite expands the glob at build time
// into a `path → () => import(path)` map. Adding a locale (drop a
// `.po`, run `pnpm i18n:compile`) appears here automatically.
const ADMIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../locales/*.mjs",
);

// First-party workspace plugins ship catalogs via static glob —
// admin reads them at zero runtime cost. Third-party plugins (not
// in the workspace) load via manifest URLs, fanned in below.
const PLUGIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../plugins/*/locales/*.mjs",
);

// The editor package ships its own chrome catalog (inspector,
// etc.); it's bundled into admin like a workspace plugin, so merge it
// the same zero-runtime-cost way.
const EDITOR_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../admin-editor/locales/*.mjs",
);

// Source locale: the language `descriptor.message` strings are authored
// in. When a user's locale isn't compiled (yet, or at all), we fall
// back here. Mirrors `lingui.config.ts:sourceLocale`.
const SOURCE_LOCALE = "en";

type PluginCatalogLoader = (pluginId: string, locale: string) => Promise<void>;

const NOOP_LOADER: PluginCatalogLoader = () => Promise.resolve();

/** Module-level handle so admin code (and plugin chunks via the
 *  `window.plumix.i18n.loadPluginCatalog` global) can reach the
 *  manifest-bound loader installed by `bootI18n`. Pre-boot calls
 *  hit the no-op default; post-boot they go through the cache. */
export const pluginCatalogLoaderRef: { current: PluginCatalogLoader } = {
  current: NOOP_LOADER,
};

/** Load and activate the compiled catalog for the user's active locale.
 *  Merges admin's own catalog with every workspace plugin catalog
 *  that has a matching `<locale>.mjs`, then fans out manifest-driven
 *  fetches for third-party plugin catalogs (slice 17 #697). The admin
 *  shell rewrites `<html lang>` server-side (slice 4) to the user's
 *  `meta.locale`; we normalize (lowercase + region-strip) and look up
 *  matching loaders. Unknown locales fall back to the source locale.
 *  A missing source catalog (e.g., a dev boot before any package has
 *  compiled) leaves Lingui in its descriptor-message fallback mode —
 *  never throws, never blanks. */
export async function bootI18n(): Promise<void> {
  const tag = document.documentElement.lang.toLowerCase().split("-")[0] ?? "";
  const requested = ADMIN_CATALOGS[`../../locales/${tag}.mjs`];
  const fallback = ADMIN_CATALOGS[`../../locales/${SOURCE_LOCALE}.mjs`];
  const adminLoader = requested ?? fallback;
  if (!adminLoader) return;
  const locale = requested ? tag : SOURCE_LOCALE;

  const adminMessages = (await adminLoader()).messages;
  const workspaceMessages = await loadWorkspacePluginCatalogs(locale);
  const editorMessages = await loadEditorCatalog(locale);
  // Editor + workspace plugins merged first, admin chrome last so admin
  // wins on collision. Slice 5's note had the opposite order; chrome
  // stability matters more than letting a plugin override
  // `breadcrumb.dashboard`. Workspace-plugin collisions on
  // admin-namespaced keys are a build-time concern (future linter,
  // not enforced here yet).
  i18n.load(locale, {
    ...editorMessages,
    ...workspaceMessages,
    ...adminMessages,
  });
  i18n.activate(locale);

  // valibot validator messages registered via `vMessage(descriptor)`
  // resolve through this hook at issue-construction time. Server-side
  // bundles skip this registration and fall back to descriptor.message.
  // Forward the full descriptor — `i18n._(MessageDescriptor)` carries
  // any `values` / `comment` field through Lingui's resolution.
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

// The editor catalog falls back to the source locale (unlike plugins) so its
// chrome is never blank — admin always ships the editor, so an uncompiled
// locale should still read English rather than the raw descriptor ids.
async function loadEditorCatalog(locale: string): Promise<Messages> {
  const loader =
    EDITOR_CATALOGS[`../../../admin-editor/locales/${locale}.mjs`] ??
    EDITOR_CATALOGS[`../../../admin-editor/locales/${SOURCE_LOCALE}.mjs`];
  if (!loader) return {};
  return (await loader()).messages;
}

async function loadWorkspacePluginCatalogs(locale: string): Promise<Messages> {
  const merged: Messages = {};
  for (const [path, loader] of Object.entries(PLUGIN_CATALOGS)) {
    // `../../../plugins/<id>/locales/<locale>.mjs` — match the
    // requested locale's filename. No fallback at the plugin layer;
    // missing translations fall through to `descriptor.message`.
    if (!path.endsWith(`/locales/${locale}.mjs`)) continue;
    const mod = await loader();
    Object.assign(merged, mod.messages);
  }
  return merged;
}
