import { defineConfig } from "eslint/config";

import { baseConfig, noInternalImports } from "@plumix/eslint-config/base";

export default defineConfig(
  // The demo e2e fixture is a separate consumer workspace with its own tsconfig
  // (excluded from this package's project). Its cross-package imports can't be
  // type-resolved by this project's type-aware linting on a cold clone, and a
  // consumer app doesn't belong in the runtime's lint anyway — like a plugin
  // playground, it's linted on its own, not by the parent.
  { ignores: ["e2e/fixture/**"] },
  baseConfig,
  noInternalImports,
);
