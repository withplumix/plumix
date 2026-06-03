import { defineConfig } from "eslint/config";

import { baseConfig, noInternalImports } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(
  baseConfig,
  reactConfig,
  noInternalImports,
  // Compiled Lingui catalogs ship with /* eslint-disable */ headers;
  // tripping the unused-disable check on every build adds no signal.
  { ignores: ["locales/**"] },
);
