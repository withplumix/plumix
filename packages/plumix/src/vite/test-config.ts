import type {
  TestProjectInlineConfiguration,
  ViteUserConfig,
} from "vitest/config";

import { loadOnce } from "@plumix/core/support";

// The exclude mirrors `tooling/vitest/tiers.ts`.
// Guarded by: packages/plumix/src/vite/test-config.test.ts

/** Unit tests sit beside their source, feature tests in `tests/feature/`. */
const PROJECTS = {
  unit: ["src/**/*.test.{ts,tsx}"],
  feature: ["tests/feature/**/*.test.{ts,tsx}"],
} as const;

const EXCLUDE = ["**/*.build.test.{ts,tsx}"] as const;

const loadVitestConfig = loadOnce(() => import("vitest/config"));

/**
 * Needs `vitest` installed only when vitest reads the config. An override's
 * `include` is added to each project's, not swapped in: narrow with `exclude`.
 */
export function defineTestConfig(
  overrides: ViteUserConfig = {},
): () => Promise<ViteUserConfig> {
  return async () => {
    const { configDefaults, mergeConfig } = await loadVitestConfig();
    const projects: TestProjectInlineConfiguration[] = Object.entries(
      PROJECTS,
    ).map(([name, include]) => ({
      extends: true,
      test: {
        name,
        include: [...include],
        exclude: [...configDefaults.exclude, ...EXCLUDE],
      },
    }));
    return mergeConfig({ test: { projects } }, overrides);
  };
}
