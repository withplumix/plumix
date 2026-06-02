import { defineConfig } from "eslint/config";

import { baseConfig, noInternalImports } from "@plumix/eslint-config/base";
import { i18nConfig } from "@plumix/eslint-config/i18n";

export default defineConfig(baseConfig, noInternalImports, i18nConfig);
