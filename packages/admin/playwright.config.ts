import { defineConfig, devices } from "@playwright/test";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// Isolate e2e's Vite from the regular dev server port to avoid clashing with
// a developer already running `pnpm dev`.
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
    command: `pnpm exec vite --port ${String(E2E_PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  },
});
