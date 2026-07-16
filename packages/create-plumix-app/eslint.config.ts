import { defineConfig, globalIgnores } from "eslint/config";

import { baseConfig, noInternalImports } from "@plumix/eslint-config/base";

export default defineConfig(
  // `base/` is the scaffolder's template payload, not package source: it is
  // copied verbatim into generated projects and typechecks there, not here.
  globalIgnores(["base/"]),
  baseConfig,
  noInternalImports,
);
