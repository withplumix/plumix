import { fileURLToPath } from "node:url";
import type { AppContext } from "plumix/plugin";
import type { Entry, NewEntry } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import {
  applyTestSchema,
  createTestContext,
  createTestDb,
  factoriesFor,
} from "plumix/test";

/** The history this package ships, at its root. */
const migrations = fileURLToPath(new URL("../../migrations", import.meta.url));

export type CommentsTestDb = DispatcherHarness["db"];

export function ctxFor(db: CommentsTestDb): AppContext {
  return createTestContext({ db });
}

/**
 * Seed a published `post` with its author. The slug defaults to the
 * factory's unique value so repeated calls don't collide on type+slug.
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
 * Apply the plugin's shipped migration history onto an existing core test
 * db (e.g. the one inside `createDispatcherHarness`). The FKs reference core
 * `entries`/`users`, which core's history already created.
 */
export async function applyCommentsSchema(db: CommentsTestDb): Promise<void> {
  await applyTestSchema(db, migrations);
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
