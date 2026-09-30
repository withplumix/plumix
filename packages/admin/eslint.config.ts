import { defineConfig } from "eslint/config";

import { adminUiConfig, baseConfig } from "@plumix/eslint-config/base";
import { i18nStrictConfig } from "@plumix/eslint-config/i18n";
import { reactConfig } from "@plumix/eslint-config/react";

// `lingui/no-unlocalized-strings` is on for all of `src/**`. A string that
// is never copy is exempted by its call site or property name in
// `i18nStrictOverrides`, not by file.
export default defineConfig(
  baseConfig,
  adminUiConfig,
  reactConfig,
  i18nStrictConfig,
  {
    // Vendored shadcn/ui primitives — kept verbatim so `shadcn diff` upgrades
    // don't merge-conflict. Lint these like we lint node_modules: we don't.
    // Compiled Lingui catalogs are generated; their `/*eslint-disable*/`
    // header trips the unused-disable-directive rule.
    // E2E fixture plugins live under `e2e/fixtures/*/src/*` and aren't
    // user-facing — keep them out of the `no-unlocalized-strings` net. Only
    // the fixtures: the specs themselves are linted, so the test-id query
    // convention reaches them.
    ignores: ["src/components/ui/**", "locales/**", "e2e/fixtures/**"],
  },
  {
    // Colocated tests match `src/**`, so the strict i18n net would catch
    // their fixture copy. Only that rule relaxes — a bare `ignores` entry
    // here would be a *global* ignore and exempt tests from every rule,
    // which is how they went unlinted before.
    files: ["**/*.test.{ts,tsx}"],
    rules: { "lingui/no-unlocalized-strings": "off" },
  },
);
