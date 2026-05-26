import { defineConfig } from "eslint/config";

import {
  baseConfig,
  noBareThrowError,
  noInternalImports,
} from "@plumix/eslint-config/base";

export default defineConfig(baseConfig, noBareThrowError, noInternalImports);
