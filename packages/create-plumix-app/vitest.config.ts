import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Default base config only scans `src/**` and `test/**`. The
      // template-drift-detection script's pure helpers live under
      // `scripts/` so vitest needs to pick them up here too.
      include: [
        "src/**/*.test.{ts,tsx}",
        "test/**/*.test.{ts,tsx}",
        "scripts/**/*.test.{ts,mts}",
      ],
    },
  }),
);
