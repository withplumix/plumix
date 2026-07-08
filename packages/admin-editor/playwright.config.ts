import { definePlumixE2EConfig } from "@plumix/core/test/playwright";

// Visual e2e for the editor, run against the standalone playground
// (no worker, no orpc). The host page mounts PlumixEditor pointed at a
// same-origin canvas.html, so the postMessage bridge — and therefore real
// block geometry, selection overlays, the floating toolbar, and drag — all
// run in a real browser, covering exactly what the jsdom + mock-RPC admin
// suite structurally cannot. Built then previewed for CI determinism.
const E2E_PORT = 5181;

export default definePlumixE2EConfig({
  port: E2E_PORT,
  testDir: "./e2e",
  baseURL: `http://localhost:${String(E2E_PORT)}/`,
  webServerCommand: [
    "pnpm run playground:build",
    `pnpm exec vite preview --port ${String(E2E_PORT)} --strictPort`,
  ].join(" && "),
});
