import type { ViteUserConfig } from "vitest/config";

import { loadOnce } from "@plumix/core/support";

// Mirrors `tooling/vitest/tiers.ts`.
// Guarded by: packages/plumix/src/vite/test-config.test.ts

/**
 * The globs reach the whole package: a config's own `include` is added to
 * this one, not swapped in. Narrow with `exclude` instead.
 */
const NODE_TIER = {
  include: ["**/*.test.{ts,tsx}"],
  exclude: ["**/*.build.test.{ts,tsx}"],
} as const;

const loadVitestConfig = loadOnce(() => import("vitest/config"));

/**
 * Needs `vitest` installed, but only when vitest reads the config, not when
 * `plumix/vite` is imported.
 */
export function defineTestConfig(
  overrides: ViteUserConfig = {},
): () => Promise<ViteUserConfig> {
  return async () => {
    const { configDefaults, mergeConfig } = await loadVitestConfig();
    const node: ViteUserConfig = {
      test: {
        include: [...NODE_TIER.include],
        exclude: [...configDefaults.exclude, ...NODE_TIER.exclude],
      },
    };
    return mergeConfig(node, overrides);
  };
}
