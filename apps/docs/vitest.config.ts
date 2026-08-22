import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // `src/` root holds the Astro site's own config, not this suite's
      // subject. `mergeConfig` concatenates, so narrow by excluding — adding
      // to `include` would widen it instead.
      coverage: { exclude: ["src/*.ts"] },
    },
  }),
);
