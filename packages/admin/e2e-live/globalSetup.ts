import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { actingAs, openPlaygroundDb } from "@plumix/core/test/playwright";

// Runs once after the baked webServer is ready, before the spec
// suite. Seeds an admin user into the migrated D1, mints a session,
// and writes the storageState.json that playwright's
// `use.storageState` reads per-context. Anchors on `process.cwd()`
// (the package root, where the pnpm script runs) because that's what
// playwright's node:fs-based storageState reader resolves against —
// NOT the config directory. See menu/e2e/globalSetup.ts for the same
// rationale.
//
// Re-runs against a still-warm worker (`reuseExistingServer` skips the
// state wipe baked into the webServer command) reuse the admin row from
// the previous run instead of tripping the users.email UNIQUE
// constraint — `actingAs` mints a fresh session either way.
export default async function globalSetup(): Promise<void> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const existingAdmin = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.role, "admin"),
  });
  const { storageState } = await actingAs(db, existingAdmin ?? "admin");
  await writeFile(
    resolve(process.cwd(), "storageState.json"),
    JSON.stringify(storageState, null, 2),
    "utf8",
  );
}
