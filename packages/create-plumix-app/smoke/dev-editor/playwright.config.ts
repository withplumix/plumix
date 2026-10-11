import { definePlumixE2EConfig } from "plumix/test/playwright";

// Copied into a scaffolded project by `scripts/smoke.mjs`, one folder below
// its root, so `plumix/test/playwright` resolves from the installed tarball.
// The baked webServer wipes the state the built-server check left, migrates
// afresh and runs `plumix dev` through the runtime's own CLI.
export default definePlumixE2EConfig({
  port: Number(process.env.PLUMIX_SMOKE_PORT),
  configDir: import.meta.dirname,
  playground: "..",
  // The spec signs in with `actingAs` once the server has migrated.
  seedAdminSession: false,
});
