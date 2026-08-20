import {
  definePlumixE2EConfig,
  resolveE2EPort,
} from "@plumix/core/test/playwright";

// Visual e2e for the editor, run against the standalone playground
// (no worker, no orpc). The host page mounts PlumixEditor pointed at a
// same-origin canvas.html, so the postMessage bridge — and therefore real
// block geometry, selection overlays, the floating toolbar, and drag — all
// run in a real browser, covering exactly what the jsdom + mock-RPC admin
// suite structurally cannot. Built then previewed for CI determinism.
// `port` below takes the *base*; definePlumixE2EConfig applies
// PLUMIX_E2E_PORT_OFFSET itself. The preview command and base URL are built
// here, out of the helper's reach, so they resolve the same base explicitly.
const E2E_PORT_BASE = 5181;
const E2E_PORT = resolveE2EPort(E2E_PORT_BASE);

export default definePlumixE2EConfig({
  port: E2E_PORT_BASE,
  testDir: "./e2e",
  baseURL: `http://localhost:${String(E2E_PORT)}/`,
  webServerCommand: [
    "pnpm run playground:build",
    `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
  ].join(" && "),
});
