import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      // The editor suites render heavy surfaces (Tiptap, cmdk, and Radix
      // Select/Popover portals) and drive them via userEvent; under a loaded
      // CI box a single interaction can exceed the 5s default. 15s absorbs
      // that variance without masking a genuine hang.
      testTimeout: 15_000,
    },
  }),
);
