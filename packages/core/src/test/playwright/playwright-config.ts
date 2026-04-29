import type { PlaywrightTestConfig } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";

export interface PlumixE2EConfigOptions {
  /** Directory passed through to playwright's `testDir`. */
  readonly testDir: string;
  /** Base URL the spec navigates against (also used as `webServer.url`). */
  readonly baseURL: string;
  /** Shell command(s) run before the suite — typically build + preview. */
  readonly webServerCommand: string;
}

/**
 * Shared Playwright config for plumix e2e suites. Standardises the
 * options every suite wants the same way (chromium-only project,
 * fullyParallel, CI retry/worker tuning, github reporter on CI) and
 * leaves the per-suite knobs — testDir, base URL, the build/preview
 * command — as parameters.
 *
 * Used by `packages/admin/playwright.config.ts` and each
 * `packages/plugins/<plugin>/e2e/playwright.config.ts`.
 */
export function definePlumixE2EConfig(
  options: PlumixE2EConfigOptions,
): PlaywrightTestConfig {
  return defineConfig({
    testDir: options.testDir,
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [["list"], ["github"]] : [["list"], ["html"]],
    use: {
      baseURL: options.baseURL,
      trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: options.webServerCommand,
      url: options.baseURL,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  });
}
