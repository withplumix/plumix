import { defineConfig, devices } from "@playwright/test";

import {
  definePlumixE2EConfig,
  resolveE2EPort,
} from "@plumix/core/test/playwright";

import { CAPTURE_ENDPOINT_ENV } from "./screenshots/capture-browser.js";
import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// E2E always runs against the production build via `vite preview`. The
// build-time alias seam (admin globals + per-site plugin assembly)
// only kicks in for built artifacts; dev-mode HMR doesn't exercise it.
// `port` below takes the *base*; definePlumixE2EConfig applies
// PLUMIX_E2E_PORT_OFFSET itself. The preview command and base URL are built
// here, out of the helper's reach, so they resolve the same base explicitly.
const E2E_PORT_BASE = 5180;
const E2E_PORT = resolveE2EPort(E2E_PORT_BASE);
const BASE_URL = `http://localhost:${String(E2E_PORT)}${ADMIN_BASE_PATH}/`;

const config = definePlumixE2EConfig({
  port: E2E_PORT_BASE,
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

// The documentation screenshots run on this same config — same build, same
// preview server, same mocks — as a second project rather than a second rig.
//
// Viewport and pixel ratio are fixed here rather than per subject: they are
// what makes a re-run with no UI change produce an equivalent image, and that
// holds across every subject or not at all. 2x is what a reader on a retina
// display needs; the docs build downscales from it.
//
// The browser is not this machine's. `pnpm docs:screenshots` starts the pinned
// container and publishes its endpoint here, so the bytes come out the same
// wherever the capture was run from; `<loopback>` tunnels the preview server —
// which still runs here — back to it. Unset means the run bypassed that
// command, and `capture.spec.ts` refuses rather than render locally.
const captureEndpoint = process.env[CAPTURE_ENDPOINT_ENV];

export default defineConfig({
  ...config,
  projects: [
    ...(config.projects ?? []),
    {
      name: "screenshots",
      testDir: "./screenshots",
      // The directory carries vitest's `*.test.ts` beside playwright's spec,
      // and playwright's default match would claim both.
      testMatch: "**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        connectOptions:
          captureEndpoint === undefined
            ? undefined
            : { wsEndpoint: captureEndpoint, exposeNetwork: "<loopback>" },
      },
    },
  ],
});
