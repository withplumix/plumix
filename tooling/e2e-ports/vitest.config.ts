import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    // The package's source is one module at its root, not a `src/` tree.
    test: { coverage: { include: ["ports.ts"] } },
  }),
);
