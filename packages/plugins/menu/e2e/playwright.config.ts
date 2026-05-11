import { definePlumixE2EConfig } from "plumix/test/playwright";

const E2E_PORT = 5182;
const ADMIN_BASE = "/_plumix/admin";
const BASE_URL = `http://localhost:${String(E2E_PORT)}${ADMIN_BASE}/`;

export default definePlumixE2EConfig({
  testDir: ".",
  baseURL: BASE_URL,
  // Build the menu admin chunk into admin's dist, then preview the
  // patched dist. Admin must be built first (`pnpm --filter
  // @plumix/admin build`); the e2e rig reuses its static output as
  // the host shell.
  webServerCommand: [
    "pnpm exec tsx ./build-chunk.ts",
    "cd ../../../admin",
    `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
  ].join(" && "),
});
