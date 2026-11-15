import { defineConfig } from "eslint/config";

import {
  adminEffectsConfig,
  adminUiConfig,
  baseConfig,
} from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(
  baseConfig,
  adminUiConfig,
  adminEffectsConfig,
  reactConfig,
);
