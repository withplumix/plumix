// Build-time tooling, not runtime: imported only by per-package
// `lingui.config.ts` files, so `@lingui/cli` / `@lingui/format-po`
// are optional peers the importing package already carries to run
// `lingui extract` at all. Keep runtime i18n re-exports in `./i18n`.

import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

/**
 * The locales plumix's own packages ship. Engineering-justified picks
 * (Slavic plurals, RTL, CJK) — see docs/translation.md; further
 * locales arrive via community PRs.
 */
export const PLUMIX_LOCALES = ["en", "uk", "ar", "de", "zh-CN"] as const;

export interface PlumixLinguiOptions {
  /** Locale list including the "en" source. Defaults to PLUMIX_LOCALES. */
  readonly locales?: readonly string[];
}

/**
 * Shared lingui config for plumix packages and plugins: po format
 * without line numbers (stable diffs), `locales/{locale}` catalogs
 * extracted from `src`. Every package previously copy-pasted this
 * block verbatim.
 */
export function defineLinguiConfig(
  options: PlumixLinguiOptions = {},
): ReturnType<typeof defineConfig> {
  return defineConfig({
    sourceLocale: "en",
    locales: [...(options.locales ?? PLUMIX_LOCALES)],
    catalogs: [
      {
        path: "<rootDir>/locales/{locale}",
        include: ["src"],
      },
    ],
    format: formatter({ lineNumbers: false }),
  });
}
