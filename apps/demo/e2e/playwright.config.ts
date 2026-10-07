import { definePlumixE2EConfig } from "plumix/test/playwright";

// Port 3070 / inspector 9370 sit just past the plugin suites (3010-3060 /
// 9310-9360) so a parallel `turbo run test:e2e` can't collide.
export default definePlumixE2EConfig({
  port: 3070,
  inspectorPort: 9370,
  // The demo app itself is the fixture — no separate playground.
  configDir: import.meta.dirname,
  playground: "..",
  // The demo serves from a Durable Object database created per session, never
  // the shared one, so there is nothing to pin specs to or snapshot.
  sharedDatabase: false,
  // The spec enters the demo as an anonymous visitor; there's no admin session
  // to seed.
  seedAdminSession: false,
});
