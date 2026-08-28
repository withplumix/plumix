import { applyTestSchema, createTestDb } from "plumix/test";

import * as schema from "../db/schema.js";

export type FormsTestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Layer the plugin's `form_submissions` table onto an existing core test
 * db — the one inside `createDispatcherHarness`, or a bare one below.
 */
export async function applyFormsSchema(db: FormsTestDb): Promise<void> {
  await applyTestSchema(db, schema);
}

export async function createFormsTestDb(): Promise<FormsTestDb> {
  const db = await createTestDb();
  await applyFormsSchema(db);
  return db;
}
