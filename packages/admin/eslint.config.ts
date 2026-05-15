import { defineConfig } from "eslint/config";

import { baseConfig, noBareThrowError } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, reactConfig, noBareThrowError, {
  // Vendored shadcn/ui primitives — kept verbatim so `shadcn diff` upgrades
  // don't merge-conflict. Lint these like we lint node_modules: we don't.
  ignores: ["src/components/ui/**", "src/hooks/use-mobile.ts"],
});
