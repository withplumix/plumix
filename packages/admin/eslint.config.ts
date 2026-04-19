import { defineConfig } from "eslint/config";

import { baseConfig } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, reactConfig, {
  // Vendored shadcn/ui primitives — kept verbatim so `shadcn diff` upgrades
  // don't merge-conflict our edits. Its idiomatic patterns (random in
  // useMemo, setState in effect, `type` instead of `interface`, inline
  // `type` imports) trip our strict React Compiler + TS rules; silence only
  // the rules that hit shadcn's shape, not the files' exports or other
  // code quality.
  files: ["src/components/ui/**/*.{ts,tsx}", "src/hooks/use-mobile.ts"],
  rules: {
    "react-hooks/purity": "off",
    "react-hooks/set-state-in-effect": "off",
    "@typescript-eslint/consistent-type-definitions": "off",
    "@typescript-eslint/consistent-type-imports": "off",
    "import-x/consistent-type-specifier-style": "off",
  },
});
