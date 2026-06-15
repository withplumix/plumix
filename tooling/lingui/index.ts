// Shared lingui config for plumix's own packages: po format without
// line numbers (stable diffs), `locales/{locale}` catalogs extracted
// from `src`. Source-shipped like every tooling package, so configs
// resolve before any build. External plugin authors get a standalone
// config scaffolded by `plumix i18n init` instead — this package is
// private.

import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

/**
 * The locales plumix's own packages ship. Engineering-justified picks
 * (Slavic plurals, RTL, CJK); further locales arrive via community PRs.
 */
export const PLUMIX_LOCALES = ["en", "uk", "ar", "de", "zh-CN"] as const;

/** One translatable surface: a catalog path template paired with the
 *  source dirs scanned for its descriptors. */
export interface PlumixLinguiSurface {
  /** Catalog path template (the `{locale}` placeholder is required). */
  readonly catalogPath: string;
  /** Source dirs scanned for this surface's descriptors. */
  readonly include: readonly string[];
}

export interface PlumixLinguiOptions {
  /** Locale list including the "en" source. Defaults to PLUMIX_LOCALES. */
  readonly locales?: readonly string[];
  /**
   * Catalog path template (the `{locale}` placeholder is required).
   * Defaults to `<rootDir>/locales/{locale}`. Packages that host more
   * than one translatable surface name catalogs per surface — core
   * uses `<rootDir>/locales/admin-bar-{locale}` so a later debug-bar
   * catalog can sit beside it without colliding.
   */
  readonly catalogPath?: string;
  /** Source dirs scanned for descriptors. Defaults to `["src"]`. */
  readonly include?: readonly string[];
  /**
   * Multiple catalog surfaces in one package (e.g. core's admin-bar +
   * welcome screen), each with its own path template and source dirs.
   * Takes precedence over `catalogPath`/`include` when provided.
   */
  readonly surfaces?: readonly PlumixLinguiSurface[];
}

export function defineLinguiConfig(
  options: PlumixLinguiOptions = {},
): ReturnType<typeof defineConfig> {
  const surfaces = options.surfaces ?? [
    {
      catalogPath: options.catalogPath ?? "<rootDir>/locales/{locale}",
      include: options.include ?? ["src"],
    },
  ];
  return defineConfig({
    sourceLocale: "en",
    locales: [...(options.locales ?? PLUMIX_LOCALES)],
    catalogs: surfaces.map((surface) => ({
      path: surface.catalogPath,
      include: [...surface.include],
    })),
    format: formatter({ lineNumbers: false }),
  });
}
