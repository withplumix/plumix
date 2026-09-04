import { definePlumixE2EConfig } from "plumix/test/playwright";

// Port 3110 / inspector 9410 continue the 30N0 / 93N0 sequence past the
// plugin suites and apps/demo (3010-3100 / 9310-9400), so a parallel
// `turbo run test:e2e` can't collide.
export default definePlumixE2EConfig({
  port: 3110,
  inspectorPort: 9410,
  configDir: import.meta.dirname,
  playground: "../playground",
  // The shared spec bootstraps the first admin itself; there is no session
  // to seed.
  seedAdminSession: false,
});
