import type { AppContext } from "plumix/plugin";
import type { Entry, NewEntry } from "plumix/schema";
import {
  applyTestSchema,
  createTestContext,
  createTestDb,
  factoriesFor,
} from "plumix/test";

import * as schema from "../db/schema.js";

export type CommentsTestDb = Awaited<ReturnType<typeof createTestDb>>;

export function ctxFor(db: CommentsTestDb): AppContext {
  return createTestContext({ db });
}

/**
 * Seed a published `post` (with its author) — the comment target every
 * read-path test needs. Slug defaults to the factory's unique value so
 * repeated calls don't collide on the type+slug unique index.
 */
export async function seedPublishedPost(
  db: CommentsTestDb,
  overrides: Partial<NewEntry> = {},
): Promise<Entry> {
  const factories = factoriesFor(db);
  const author = await factories.user.create({});
  return factories.entry.create({
    type: "post",
    authorId: author.id,
    status: "published",
    ...overrides,
  });
}

/**
 * Layer the plugin's `comments` table onto an existing core test db
 * (e.g. the one inside `createDispatcherHarness`). The FKs reference core
 * `entries`/`users`, which the core schema already created.
 */
export async function applyCommentsSchema(db: CommentsTestDb): Promise<void> {
  await applyTestSchema(db, schema);
}

/**
 * An in-memory test database with the core schema (via `createTestDb`)
 * plus the plugin's `comments` table layered on top. Use with the core
 * `factoriesFor(db)` and `commentFactory`.
 */
export async function createCommentsTestDb(): Promise<CommentsTestDb> {
  const db = await createTestDb();
  await applyCommentsSchema(db);
  return db;
}
