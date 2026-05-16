import { definePlumixE2EConfig } from "@plumix/core/test/playwright";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// E2E always runs against the production build via `vite preview`. The
// build-time alias seam (admin globals + per-site plugin assembly)
// only kicks in for built artifacts; dev-mode HMR doesn't exercise it.
const E2E_PORT = 5180;
const BASE_URL = `http://localhost:${String(E2E_PORT)}${ADMIN_BASE_PATH}/`;

export default definePlumixE2EConfig({
  port: E2E_PORT,
  testDir: "./e2e",
  baseURL: BASE_URL,
  // Turbo's `test:e2e` task has `dependsOn: ["build", "^build"]`, so
  // `packages/admin/dist/` is already produced by the time this
  // webServer starts. We do NOT re-run `pnpm run build` here — it
  // wipes `packages/admin/dist/` mid-flight, racing with the parallel
  // `plumix:build` step's `copy-admin.mjs` that reads from the same
  // directory. Assemble the runtime-proof plugin into the existing
  // dist, then preview it.
  //
  // Running e2e standalone (without turbo): `pnpm exec turbo run
  // test:e2e --filter @plumix/admin` builds first; a bare `pnpm
  // test:e2e` will 404 until you `pnpm build` once.
  webServerCommand: [
    "pnpm exec tsx e2e/fixtures/build-runtime-proof-plugin.ts",
    `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
  ].join(" && "),
});
