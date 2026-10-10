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
   * Must contain `{locale}`. A package with several translatable surfaces
   * names a catalog per surface so they don't collide.
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
