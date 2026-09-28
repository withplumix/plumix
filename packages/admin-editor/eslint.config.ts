import { defineConfig } from "eslint/config";

import { adminUiConfig, baseConfig } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, adminUiConfig, reactConfig);
