import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

// jsdom is needed for the admin component suites (`src/admin/*.test.tsx`).
// The server-side suites are environment-agnostic and work fine under
// jsdom too, so we set one environment for the whole package rather than
// branching per file pattern.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
    },
  }),
);
