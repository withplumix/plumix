import { definePlumixE2EConfig } from "@plumix/core/test/playwright";

// Worker-driven editor e2e. The mock-based suite in `../e2e` stubs every
// RPC, so the autosave round-trip (entry.update → refetch →
// `_preview.source` flip) structurally cannot occur there — and that loop
// is exactly where the editor regressions live. This config boots the
// playground at `../playground` via `plumix dev` against real D1 and
// drives the editor the way an author does: pointer drags, sustained
// typing, pattern inserts, publish lifecycle.
//
// Build ordering: the playground's `plumix dev` needs plumix's dist, but
// admin can't depend on plumix (plumix devDeps admin for copy-admin — a
// cycle). turbo.json pins `@plumix/admin#test:e2e` to `plumix#build`
// instead.
export default definePlumixE2EConfig({
  // Ports follow the worker-driven suite convention (HTTP ↔ inspector):
  // 3010/audit-log, 3020/blog, 3030/media, 3040/menu, 3050/pages.
  port: 3060,
  inspectorPort: 9360,
  playground: "../playground",
  testDir: "./specs",
});
