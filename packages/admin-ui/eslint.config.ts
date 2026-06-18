import { defineConfig } from "eslint/config";

import { baseConfig } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, reactConfig, {
  // Vendored shadcn/ui primitives (plus the `cn` helper and the
  // `useIsMobile` hook shadcn ships with the sidebar) — kept verbatim so
  // `shadcn diff` upgrades don't merge-conflict. Lint these like we lint
  // node_modules: we don't. The generated `index.ts` barrel stays linted.
  ignores: ["src/**/*.tsx", "src/utils.ts", "src/use-mobile.ts"],
});
