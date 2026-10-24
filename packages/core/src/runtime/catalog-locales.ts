import { catalogs as adminBar } from "@plumix/core/locales/index/admin-bar";
import { catalogs as blocks } from "@plumix/core/locales/index/blocks";
import { catalogs as mail } from "@plumix/core/locales/index/mail";
import { catalogs as welcome } from "@plumix/core/locales/index/welcome";

import type { CatalogIndex, CatalogLocales } from "../blocks/lazy-catalogs.js";
import { projectCatalogLocales } from "../i18n/catalog-locale.js";

const SOURCE_LOCALE = "en";

/**
 * Core's surfaces that read a catalog by the request's enabled locale, each
 * projected onto a site's enabled locales, as the `plumix` Vite plugin serves
 * it from `virtual:plumix/catalog-locales`.
 */
export interface CoreCatalogLocales {
  readonly blocks: CatalogLocales;
  readonly mail: CatalogLocales;
  readonly welcome: CatalogLocales;
  readonly "admin-bar": CatalogLocales;
}

/** Each surface from the locales its own `.po` files ship. */
export function projectCoreCatalogLocales(
  enabled: readonly string[],
): CoreCatalogLocales {
  const project = (index: CatalogIndex) =>
    projectCatalogLocales(enabled, Object.keys(index), SOURCE_LOCALE);
  return {
    blocks: project(blocks),
    mail: project(mail),
    welcome: project(welcome),
    "admin-bar": project(adminBar),
  };
}
