import { defineConfig } from "eslint/config";

import { baseConfig, noBareThrowErrorFor } from "@plumix/eslint-config/base";

export default defineConfig(
  baseConfig,
  // Migrated areas per umbrella #232. Subsequent slices extend this list.
  noBareThrowErrorFor([
    "src/runtime/**/*.ts",
    "src/route/**/*.ts",
    "src/theme.ts",
    "src/theme-errors.ts",
  ]),
);
