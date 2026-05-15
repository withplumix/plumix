import { defineConfig } from "eslint/config";

import { baseConfig, noBareThrowErrorFor } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(
  baseConfig,
  reactConfig,
  // Migrated areas per umbrella #232. Subsequent slices extend this list.
  noBareThrowErrorFor(["src/lib/**/*.ts"]),
  {
    // Vendored shadcn/ui primitives — kept verbatim so `shadcn diff` upgrades
    // don't merge-conflict. Lint these like we lint node_modules: we don't.
    ignores: ["src/components/ui/**", "src/hooks/use-mobile.ts"],
  },
);
