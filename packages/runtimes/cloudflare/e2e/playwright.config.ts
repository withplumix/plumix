import { definePlumixE2EConfig } from "plumix/test/playwright";

// The demo fixture has no D1 — its database is the per-session Durable Object —
// so the baked `playground` command (which applies D1 migrations) doesn't fit.
// We drive `plumix dev` directly instead, wiping `.wrangler/state` first so each
// run starts from empty DO storage. Port 3070 / inspector 9370 sit just past the
// plugin suites (3010-3060 / 9310-9360) so a parallel `turbo run test:e2e`
// can't collide.
export default definePlumixE2EConfig({
  port: 3070,
  testDir: ".",
  webServerCommand:
    "cd fixture && rm -rf .wrangler/state && pnpm exec plumix dev --port 3070 --inspector-port 9370",
});
