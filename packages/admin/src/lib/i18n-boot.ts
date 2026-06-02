import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

// Admin's own compiled catalogs. Vite expands the glob at build time
// into a `path → () => import(path)` map. Adding a locale (drop a
// `.po`, run `pnpm i18n:compile`) appears here automatically.
const ADMIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../locales/*.mjs",
);

// First-party plugin catalogs shipped via workspace deps. Same glob
// mechanism: any plugin under `packages/plugins/*/locales/*.mjs`
// gets merged into the active locale alongside admin chrome. Slice
// 17 (#697) wires the equivalent for third-party plugins via
// manifest URLs + runtime fetch — this static path covers the
// workspace-bundled case at zero runtime cost.
const PLUGIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../plugins/*/locales/*.mjs",
);

// Source locale: the language `descriptor.message` strings are authored
// in. When a user's locale isn't compiled (yet, or at all), we fall
// back here. Mirrors `lingui.config.ts:sourceLocale`.
const SOURCE_LOCALE = "en";

function adminCatalogPath(locale: string): string {
  return `../../locales/${locale}.mjs`;
}

/** Load and activate the compiled catalog for the user's active locale.
 *  Merges admin's own catalog with every workspace plugin catalog
 *  that has a matching `<locale>.mjs`. The admin shell rewrites
 *  `<html lang>` server-side (slice 4) to the user's `meta.locale`;
 *  we normalize (lowercase + region-strip) and look up matching
 *  loaders. Unknown locales fall back to the source locale. A missing
 *  source catalog (e.g., a dev boot before any package has compiled)
 *  leaves Lingui in its descriptor-message fallback mode — never
 *  throws, never blanks. */
export async function bootI18n(): Promise<void> {
  const tag = document.documentElement.lang.toLowerCase().split("-")[0] ?? "";
  const requested = ADMIN_CATALOGS[adminCatalogPath(tag)];
  const fallback = ADMIN_CATALOGS[adminCatalogPath(SOURCE_LOCALE)];
  const adminLoader = requested ?? fallback;
  if (!adminLoader) return;
  const locale = requested ? tag : SOURCE_LOCALE;

  const adminMessages = (await adminLoader()).messages;
  const pluginMessages = await loadPluginCatalogs(locale);
  // Merge: plugin keys can't collide with admin's (admin uses
  // `breadcrumb.*` / `menu.*` / etc.; plugins use `plugin.<id>.*`),
  // so a flat spread is the right shape. If a future collision is a
  // real concern, namespacing happens at authoring time.
  i18n.load(locale, { ...adminMessages, ...pluginMessages });
  i18n.activate(locale);
}

async function loadPluginCatalogs(locale: string): Promise<Messages> {
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
