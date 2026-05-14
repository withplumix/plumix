import { definePlumixE2EConfig } from "plumix/test/playwright";

// `plumix dev` boots vite at its default port (5173) for the blog
// example. The package root IS the playground (no separate
// `playground/` dir — this IS the example), so `playground: ".."`
// hops up one level from `e2e/`.
const E2E_PORT = 5173;

export default definePlumixE2EConfig({
  port: E2E_PORT,
  playground: "..",
  baseURL: `http://localhost:${String(E2E_PORT)}/`,
  // Public-route example — no admin session needed, no globalSetup,
  // no storageState wiring.
  seedAdminSession: false,
  // The blog example doesn't register a front-page intent, so `/`
  // returns 404. Waiting on the port instead of the URL avoids the
  // 180s timeout that would otherwise fire while Playwright polls
  // for a 2xx that will never arrive.
  webServerPort: E2E_PORT,
  // Seed smoke-test fixtures after the migrations apply, before the
  // worker boots.
  extraSetup:
    "pnpm exec wrangler d1 execute plumix_blog --local --file=e2e/seed.sql",
});
