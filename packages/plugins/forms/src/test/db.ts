import { fileURLToPath } from "node:url";
import type { DispatcherHarness } from "plumix/test";
import { applyTestSchema, createTestDb } from "plumix/test";

/** The history this package ships, at its root. */
const migrations = fileURLToPath(new URL("../../migrations", import.meta.url));

export type FormsTestDb = DispatcherHarness["db"];

/**
 * Apply the plugin's shipped migration history onto an existing core test
 * db — the one inside `createDispatcherHarness`, or a bare one below.
 */
export async function applyFormsSchema(db: FormsTestDb): Promise<void> {
  await applyTestSchema(db, migrations);
}

export async function createFormsTestDb(): Promise<FormsTestDb> {
  const db = await createTestDb();
  await applyFormsSchema(db);
  return db;
}
