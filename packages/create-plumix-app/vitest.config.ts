import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  // `base/` is the template payload: its tests run in a generated project,
  // which the smoke tests, not against this package.
  defineConfig({ test: { exclude: ["base/**"] } }),
);
