import { defineConfig } from "eslint/config";

import { adminUiConfig, baseConfig } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(
  baseConfig,
  adminUiConfig,
  reactConfig,
  {
    // This package is the design system the shadcn rules defend, so its own
    // components style themselves rather than composing a primitive.
    files: ["src/**/*.tsx"],
    rules: {
      "shadcn/no-raw-colors": "off",
      "shadcn/no-unknown-classes": "off",
      "shadcn/no-restyle": "off",
      "shadcn/no-arbitrary-values": "off",
    },
  },
);
