import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 5181;
const ADMIN_BASE = "/_plumix/admin";
const BASE_URL = `http://localhost:${String(E2E_PORT)}${ADMIN_BASE}/`;

export default defineConfig({
  testDir: ".",
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
    // Build the media admin chunk into admin's dist, then preview the
    // patched dist. Admin must be built first (`pnpm --filter @plumix/admin
    // build`) — the e2e rig reuses its static output as the host shell.
    // The build-chunk step runs from this `e2e/` cwd; vite preview cd's
    // into admin's directory so its `vite.config` resolves against `dist/`.
    command: [
      "pnpm exec tsx ./build-chunk.ts",
      "cd ../../../admin",
      `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
    ].join(" && "),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
  },
});
