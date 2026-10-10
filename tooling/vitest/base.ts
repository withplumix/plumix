import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// By name: a relative `.ts` specifier would need `allowImportingTsExtensions`
// in every consumer's tsconfig.
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";
import {
  BROWSER_TIER,
  NODE_TIER,
  TEST_TIER_DEFINES,
} from "@plumix/vitest-config/tiers";

/**
 * `plumix/vite`'s `defineTestConfig` keeps its own copy of `./tiers.ts`, since
 * this package sits below `plumix`; a test in `plumix` holds them equal.
 */
export const baseConfig = defineConfig({
  plugins: [plumixSourceResolver()],
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
        // Otherwise a missing file gets the package's index.html, Vite follows
        // it into the app, optimizes deps mid-run, and the reload hangs.
        appType: "custom",
        define: { ...TEST_TIER_DEFINES },
        // Scan the browser tests up front: a dependency Vite first meets
        // mid-run is optimized then, and the reload that follows fails the
        // test file that was loading.
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
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
    },
  },
});
