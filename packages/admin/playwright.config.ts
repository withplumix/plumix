import { defineConfig, devices } from "@playwright/test";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// E2E always runs against the production build via `vite preview`. The
// build-time alias seam (admin globals + per-site plugin assembly)
// only kicks in for built artifacts; dev-mode HMR doesn't exercise it.
const E2E_PORT = 5180;
const BASE_URL = `http://localhost:${String(E2E_PORT)}${ADMIN_BASE_PATH}/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"], ["html"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build admin → assemble the runtime-proof fixture plugin via
    // plumix's real assembler → preview the dist. The assembler
    // writes site-bundle.js into dist/plugins/ and patches the script
    // tag into index.html.
    command: [
      "pnpm run build",
      "pnpm exec tsx e2e/fixtures/build-runtime-proof-plugin.ts",
      `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
    ].join(" && "),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
  },
});
