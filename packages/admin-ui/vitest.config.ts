import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // The suite guards the component roster, which the sync script under
      // `scripts/` owns; `src/` is vendored shadcn with no tests of its own.
      include: ["scripts/**/*.test.ts"],
      environment: "node",
    },
  }),
);
