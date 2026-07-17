import { defineConfig } from "eslint/config";

import { baseConfig, noInternalImports } from "@plumix/eslint-config/base";

export default defineConfig(
  // The playground is a separate consumer workspace with its own tsconfig
  // (outside this package's project). Its cross-package imports can't be
  // type-resolved by this project's type-aware linting on a cold clone, and a
  // consumer app doesn't belong in the runtime's lint anyway.
  { ignores: ["playground/**"] },
  baseConfig,
  noInternalImports,
);
