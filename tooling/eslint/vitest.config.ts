import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Lint fixtures are source files with deliberate violations, some of
      // them named `*.test.ts` to exercise the rules' test-file carve-out.
      // They are inputs to the suite, never suites themselves.
      exclude: ["test/fixtures/**"],
      // The package's source is its config modules and rule modules, not a
      // `src/` tree — point coverage at the rules the suite exercises.
      coverage: { include: ["rules/**/*.ts"] },
    },
  }),
);
