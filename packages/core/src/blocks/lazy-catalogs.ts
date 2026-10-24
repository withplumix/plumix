import type { CompiledCatalog } from "./i18n-label.js";

/**
 * A surface's compiled catalogs by locale, as the catalog compile writes them
 * to `locales/index/<surface>.mjs`: one lazy loader per `.po` file.
 */
export type CatalogIndex = Readonly<
  Record<string, () => Promise<{ readonly messages: CompiledCatalog }>>
>;

export interface LazyCatalogs {
  /** The locales the surface ships, known without importing a catalog. */
  readonly locales: readonly string[];
  /** Imports `locale`'s catalog on its first call; a locale with none is empty. */
  load(locale: string): Promise<CompiledCatalog>;
  /**
   * For a render that cannot await: what `load` has imported for `locale`,
   * empty until then.
   */
  loaded(locale: string): CompiledCatalog;
}

/** Once per locale per isolate: the catalogs are static build output. */
export function lazyCatalogs(index: CatalogIndex): LazyCatalogs {
  const pending = new Map<string, Promise<CompiledCatalog>>();
  const imported = new Map<string, CompiledCatalog>();
  return {
    locales: Object.keys(index),
    load(locale) {
      let catalog = pending.get(locale);
      if (catalog === undefined) {
        const importCatalog = index[locale];
        catalog = (
          importCatalog === undefined
            ? Promise.resolve({})
            : importCatalog().then((module) => module.messages)
        ).then((messages) => {
          imported.set(locale, messages);
          return messages;
        });
        pending.set(locale, catalog);
      }
      return catalog;
    },
    loaded: (locale) => imported.get(locale) ?? {},
  };
}
