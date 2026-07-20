import { definePlumixE2EConfig } from "plumix/test/playwright";

// Port 3070 / inspector 9370 sit just past the plugin suites (3010-3060 /
// 9310-9360) so a parallel `turbo run test:e2e` can't collide.
export default definePlumixE2EConfig({
  port: 3070,
  inspectorPort: 9370,
  // The demo app itself is the fixture — no separate playground.
  playground: "..",
  // The demo's database is a Durable Object created per session, which applies
  // its own schema at runtime — there is nothing to migrate before boot.
  applyMigrations: false,
  // The spec enters the demo as an anonymous visitor; there's no admin session
  // to seed.
  seedAdminSession: false,
});
