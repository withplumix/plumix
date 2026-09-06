import { definePlumixE2EConfig } from "plumix/test/playwright";

// Port 3120 continues the 30N0 sequence past the plugin suites, apps/demo and
// the Cloudflare playground (3010-3110), so a parallel `turbo run test:e2e`
// can't collide. No inspector port: `plumix dev` on Node is a Vite server in
// this process, not a workerd the plugin has to be told where to open.
export default definePlumixE2EConfig({
  port: 3120,
  configDir: import.meta.dirname,
  playground: "../playground",
  // The shared spec bootstraps the first admin itself; there is no session
  // to seed.
  seedAdminSession: false,
});
