import { definePlumixE2EConfig } from "plumix/test/playwright";

// `plumix dev` boots vite at its default port (5173) for the blog
// example. Other suites use 5181/5182; this one keeps the vanilla
// vite port since the cloudflare-vite-plugin doesn't expose an
// override knob today.
const E2E_PORT = 5173;
const BASE_URL = `http://localhost:${String(E2E_PORT)}/`;

// The webServerCommand wipes the local D1 state, regenerates the
// drizzle migrations from the current plumix schema, applies them to
// a fresh miniflare D1, seeds the smoke-test fixtures, then boots
// `plumix dev`. Playwright runs the command with cwd = this config
// directory (examples/blog/e2e/), so the first `cd ..` hops back to
// the package root where plumix / wrangler expect to find their
// config files.
const webServerCommand = [
  "cd ..",
  "rm -rf .wrangler/state",
  "pnpm exec plumix migrate generate",
  "pnpm exec wrangler d1 migrations apply plumix_blog --local",
  "pnpm exec wrangler d1 execute plumix_blog --local --file=e2e/seed.sql",
  "pnpm exec plumix dev",
].join(" && ");

export default definePlumixE2EConfig({
  testDir: ".",
  baseURL: BASE_URL,
  webServerCommand,
  // The blog example doesn't register a front-page intent, so `/`
  // returns 404. Waiting on the port instead of the URL avoids the
  // 180s timeout that would otherwise fire while Playwright polls
  // for a 2xx that will never arrive.
  webServerPort: E2E_PORT,
});
