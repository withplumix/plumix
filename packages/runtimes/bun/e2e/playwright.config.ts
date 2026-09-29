import { definePlumixE2EConfig } from "plumix/test/playwright";

// Port 3130 continues the 30N0 sequence past the Node playground (3120), so a
// parallel `turbo run test:e2e` can't collide. No inspector port: `plumix dev`
// on Bun is a Vite server in the Bun process, as it is on Node. Every CLI step
// runs on Bun through the `cli` prefix in this package's `plumix.e2e` block.
export default definePlumixE2EConfig({
  port: 3130,
  configDir: import.meta.dirname,
  playground: "../playground",
  // The shared spec bootstraps the first admin itself; there is no session
  // to seed.
  seedAdminSession: false,
});
