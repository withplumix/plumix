import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    // The package's source sits at its root, not in a `src/` tree.
    test: { coverage: { include: ["*.ts"] } },
  }),
);
