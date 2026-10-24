import type { LinguiConfig } from "@lingui/conf";
import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

import { discoverCatalogLocales } from "../../i18n-compile/index.mjs";
import { shippedChain } from "./catalog-locale.js";

const SOURCE_LOCALE = "en";

function isCanonical(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale)[0] === locale;
  } catch {
    return false;
  }
}

/** One translatable surface: a catalog path and the source dirs it reads. */
export interface LinguiSurface {
  /** Catalog path template; must contain `{locale}`. */
  readonly catalogPath: string;
  /** Source dirs scanned for this surface's messages. */
  readonly include: readonly string[];
}

export interface LinguiConfigOptions {
  /** The package root `<rootDir>` names: pass `import.meta.dirname`. */
  readonly rootDir: string;
  /**
   * A package with several surfaces names a catalog per surface so they don't
   * collide. Defaults to `<rootDir>/locales/{locale}` over `src`.
   */
  readonly surfaces?: readonly LinguiSurface[];
}

/**
 * The `.po` files are the only record of a package's locales, and a partial
 * catalog fills each message it lacks from its CLDR parents.
 */
export function defineLinguiConfig(options: LinguiConfigOptions): LinguiConfig {
  const surfaces = options.surfaces ?? [
    { catalogPath: "<rootDir>/locales/{locale}", include: ["src"] },
  ];
  const locales = [
    ...new Set([
      SOURCE_LOCALE,
      ...surfaces.flatMap(({ catalogPath }) =>
        discoverCatalogLocales(
          catalogPath.replace("<rootDir>", options.rootDir),
        ),
      ),
    ]),
  ];
  // A misnamed catalog is the compile's to reject, with the name to use.
  const named = locales.filter(isCanonical);
  return defineConfig({
    sourceLocale: SOURCE_LOCALE,
    locales,
    catalogs: surfaces.map(({ catalogPath, include }) => ({
      path: catalogPath,
      include: [...include],
    })),
    // An entry for every locale keeps Lingui off its own parent table, which
    // is not CLDR's (`zh-Hant` → `zh`).
    fallbackLocales: Object.fromEntries(
      locales.map((locale) => [
        locale,
        named.includes(locale)
          ? shippedChain(locale, named).filter((parent) => parent !== locale)
          : [],
      ]),
    ),
    format: formatter({ lineNumbers: false }),
  });
}
