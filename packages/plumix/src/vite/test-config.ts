import type { ViteUserConfig } from "vitest/config";

// The two test tiers (ADR 0021), as a plugin's vitest config gets them. A test
// file picks its tier by name: `*.test.ts(x)` runs in Node, and
// `*.browser.test.ts(x)` runs in headless Chromium. The table mirrors the one
// this repo's own suites run on (`tooling/vitest/tiers.ts`), and
// `test-config.test.ts` holds the two equal.

// The globs reach the whole package: vitest concatenates a config's own
// `include` onto each project's, so one added there would feed its files to
// both tiers. Narrow with `exclude` instead.
const NODE_TIER = {
  name: "node",
  include: ["**/*.test.{ts,tsx}"],
  exclude: ["**/*.build.test.{ts,tsx}", "**/*.browser.test.{ts,tsx}"],
} as const;

const BROWSER_TIER = {
  name: "browser",
  include: ["**/*.browser.test.{ts,tsx}"],
  exclude: ["**/*.build.test.{ts,tsx}"],
  browser: "chromium",
  headless: true,
  viewport: { width: 1440, height: 900 },
  screenshotFailures: false,
} as const;

// What the `plumix` Vite plugin substitutes into a production client build,
// so a browser test runs client code as it ships, with no `process` to read.
const TEST_TIER_DEFINES = {
  "process.env.WORKERS_CI": JSON.stringify(""),
  "process.env.WORKERS_CI_BRANCH": JSON.stringify(""),
  "process.env.PLUMIX_DEV": JSON.stringify(""),
  "process.env.PLUMIX_DEV_ALLOW_REMOTE": JSON.stringify(""),
  "process.env.PLUMIX_EDITOR": JSON.stringify(""),
  "process.env.PLUMIX_EDITOR_PATH_MAP": JSON.stringify(""),
  "process.env.PLUMIX_FORWARD_ERRORS": JSON.stringify(""),
} as const;

/**
 * A plugin's whole vitest config: `export default defineTestConfig()`. It sets
 * up the Node and browser tiers, and `overrides` merge over them — a setup
 * file, an alias, an `exclude` — reaching both, since each tier extends the
 * config around it.
 *
 * Needs `vitest`, `@vitest/browser-playwright` and `playwright` installed.
 * They are loaded when vitest reads the config, not when this module is
 * imported, so a site's `vite.config.ts` that imports `plumix/vite` does not
 * need them.
 */
export function defineTestConfig(
  overrides: ViteUserConfig = {},
): () => Promise<ViteUserConfig> {
  return async () => {
    const [{ configDefaults, mergeConfig }, { playwright }] = await Promise.all(
      [import("vitest/config"), import("@vitest/browser-playwright")],
    );
    const tiers: ViteUserConfig = {
      test: {
        projects: [
          {
            extends: true,
            test: {
              name: NODE_TIER.name,
              include: [...NODE_TIER.include],
              exclude: [...configDefaults.exclude, ...NODE_TIER.exclude],
            },
          },
          {
            extends: true,
            define: { ...TEST_TIER_DEFINES },
            // Scan the browser tests up front: a dependency Vite first meets
            // mid-run is optimized then, and the reload that follows fails
            // the test file that was loading.
            optimizeDeps: { entries: [...BROWSER_TIER.include] },
            test: {
              name: BROWSER_TIER.name,
              include: [...BROWSER_TIER.include],
              exclude: [...configDefaults.exclude, ...BROWSER_TIER.exclude],
              browser: {
                enabled: true,
                headless: BROWSER_TIER.headless,
                provider: playwright(),
                instances: [{ browser: BROWSER_TIER.browser }],
                viewport: { ...BROWSER_TIER.viewport },
                screenshotFailures: BROWSER_TIER.screenshotFailures,
              },
            },
          },
        ],
      },
    };
    return mergeConfig(tiers, overrides);
  };
}
