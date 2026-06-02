import { defineConfig } from "eslint/config";

import { baseConfig } from "@plumix/eslint-config/base";
import { i18nConfig } from "@plumix/eslint-config/i18n";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, reactConfig, i18nConfig, {
  // Vendored shadcn/ui primitives — kept verbatim so `shadcn diff` upgrades
  // don't merge-conflict. Lint these like we lint node_modules: we don't.
  // Compiled Lingui catalogs are generated; their `/*eslint-disable*/`
  // header trips the unused-disable-directive rule.
  ignores: ["src/components/ui/**", "src/hooks/use-mobile.ts", "locales/**"],
});
