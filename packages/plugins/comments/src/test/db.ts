import type { AppContext } from "plumix/plugin";
import type { Entry, NewEntry } from "plumix/schema";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { createTestDb, factoriesFor } from "plumix/test";

import * as schema from "../db/schema.js";

export type CommentsTestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Minimal AppContext stand-in carrying just the db, for server-module tests. */
export function ctxFor(db: CommentsTestDb): AppContext {
  return { db } as unknown as AppContext;
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

const schemaImports = schema as unknown as Record<string, unknown>;
let cachedStatements: string[] | null = null;

// drizzle-kit's `api` surface is loosely typed (`SQLiteSchema` is opaque);
// treat it as a black-box snapshot blob and read only its `id`. Mirrors
// the audit-log plugin's test-support compiler.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
async function compileCommentsSql(): Promise<string[]> {
  if (cachedStatements) return cachedStatements;
  const empty = await generateSQLiteDrizzleJson({}, undefined, "snake_case");
  const current = await generateSQLiteDrizzleJson(
    schemaImports,
    empty.id,
    "snake_case",
  );
  cachedStatements = await generateSQLiteMigration(empty, current);
  return cachedStatements;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

/**
 * Layer the plugin's `comments` table onto an existing core test db
 * (e.g. the one inside `createDispatcherHarness`). The FKs reference core
 * `entries`/`users`, which the core schema already created.
 */
export async function applyCommentsSchema(db: CommentsTestDb): Promise<void> {
  for (const stmt of await compileCommentsSql()) await db.run(sql.raw(stmt));
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
