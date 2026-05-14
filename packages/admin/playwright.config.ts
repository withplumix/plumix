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
  // Build admin → assemble the runtime-proof fixture plugin via
  // plumix's real assembler → preview the dist. The assembler writes
  // site-bundle.js into dist/plugins/ and patches the script tag into
  // index.html.
  webServerCommand: [
    "pnpm run build",
    "pnpm exec tsx e2e/fixtures/build-runtime-proof-plugin.ts",
    `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
  ].join(" && "),
});
