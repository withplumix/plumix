// Plugin catalogs arrive via `virtual:plumix/plugin-catalogs` because there's
// no fs at request time.

import { catalogs } from "@plumix/core/locales/index/blocks";

import type { CompiledCatalog } from "../../blocks/index.js";
import type {
  CatalogIndex,
  CatalogLocales,
} from "../../blocks/lazy-catalogs.js";
import { lazyCatalogs } from "../../blocks/lazy-catalogs.js";

/** As `lingui compile --namespace es` emits it. */
interface CatalogModule {
  readonly messages: CompiledCatalog;
}

/** Locale → a loader per installed plugin that ships a catalog for it. */
export type PluginCatalogs = Readonly<
  Record<string, readonly (() => Promise<CatalogModule>)[]>
>;

/** The merged block-render catalog for a request locale. */
export type BlockCatalogs = (locale: string) => Promise<CompiledCatalog>;

/**
 * `catalogLocales` is core's blocks catalogs projected onto the site's enabled
 * locales, from `virtual:plumix/catalog-locales`.
 */
export function createBlockCatalogs(
  pluginCatalogs: PluginCatalogs = {},
  catalogLocales?: CatalogLocales,
  index: CatalogIndex = catalogs,
): BlockCatalogs {
  const core = lazyCatalogs(index, catalogLocales);
  // Once per locale per isolate: the catalogs are static build output.
  const merged = new Map<string, Promise<CompiledCatalog>>();
  return (locale) => {
    let catalog = merged.get(locale);
    if (catalog === undefined) {
      catalog = Promise.all([
        core.load(locale),
        ...(pluginCatalogs[locale] ?? []).map((load) => load()),
      ]).then(([base, ...modules]) =>
        modules.reduce<CompiledCatalog>(
          (acc, module) => ({ ...acc, ...module.messages }),
          base,
        ),
      );
      merged.set(locale, catalog);
    }
    return catalog;
  };
}
