import type { CompiledCatalog } from "./i18n-label.js";

/**
 * A surface's compiled catalogs by locale, as the catalog compile writes them
 * to `locales/index/<surface>.mjs`: one lazy loader per `.po` file.
 */
export type CatalogIndex = Readonly<
  Record<string, () => Promise<{ readonly messages: CompiledCatalog }>>
>;

/**
 * A catalog set projected onto a site's enabled locales: each enabled
 * locale's catalog locale.
 */
export type CatalogLocales = Readonly<Record<string, string>>;

export interface LazyCatalogs {
  /** The locales the surface ships, known without importing a catalog. */
  readonly locales: readonly string[];
  /**
   * Imports the catalog `locale` reads on its first call; a locale with none
   * is empty.
   */
  load(locale: string): Promise<CompiledCatalog>;
  /**
   * For a render that cannot await: what `load` has imported for `locale`,
   * empty until then.
   */
  loaded(locale: string): CompiledCatalog;
}

/**
 * Once per catalog per isolate: the catalogs are static build output. A
 * locale reads the catalog its `catalogLocales` entry names, exactly; without
 * a projection, each shipped locale reads its own.
 */
export function lazyCatalogs(
  index: CatalogIndex,
  catalogLocales: CatalogLocales = Object.fromEntries(
    Object.keys(index).map((locale) => [locale, locale]),
  ),
): LazyCatalogs {
  const pending = new Map<string, Promise<CompiledCatalog>>();
  const imported = new Map<string, CompiledCatalog>();
  return {
    locales: Object.keys(index),
    load(locale) {
      const catalogLocale = catalogLocales[locale];
      const importCatalog =
        catalogLocale === undefined ? undefined : index[catalogLocale];
      if (catalogLocale === undefined || importCatalog === undefined) {
        return Promise.resolve({});
      }
      let catalog = pending.get(catalogLocale);
      if (catalog === undefined) {
        catalog = importCatalog()
          .then((module) => module.messages)
          .then((messages) => {
            imported.set(catalogLocale, messages);
            return messages;
          });
        pending.set(catalogLocale, catalog);
      }
      return catalog;
    },
    loaded(locale) {
      const catalogLocale = catalogLocales[locale];
      return catalogLocale === undefined
        ? {}
        : (imported.get(catalogLocale) ?? {});
    },
  };
}
