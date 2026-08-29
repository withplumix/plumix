import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

// jsdom for the admin component suites (`src/admin/*.test.tsx`); the
// server and markup suites are environment-agnostic and run fine under
// it too.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
    },
  }),
);
