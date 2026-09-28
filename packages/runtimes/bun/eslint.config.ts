import { defineConfig } from "eslint/config";

import { baseConfig, noInternalImports } from "@plumix/eslint-config/base";

export default defineConfig(baseConfig, noInternalImports);
