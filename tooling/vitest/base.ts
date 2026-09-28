import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// Imported by package name, not a relative `./source-resolver.ts` path: every
// package's vitest.config pulls this file in, and a `.ts` import specifier
// needs `allowImportingTsExtensions` in each consumer's tsconfig. The exports
// map hides the extension, so the plain subpath typechecks everywhere.
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";
import {
  BROWSER_TIER,
  NODE_TIER,
  TEST_TIER_DEFINES,
} from "@plumix/vitest-config/tiers";

// The two test tiers (ADR 0021). `plumix/vite`'s `defineTestConfig` builds
// the same projects for a plugin from its own copy of `./tiers.ts` — this
// package sits below `plumix` and cannot import it — and a test in `plumix`
// holds the two equal.
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
        // A request the page makes for a file that does not exist (a stylesheet
        // a test appends) would otherwise get the package's own index.html,
        // and Vite follows its entry script into the whole app. Deps it finds
        // there are optimized mid-run, and the reload hangs the run.
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
