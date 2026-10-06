import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { MigrationConfig } from "drizzle-orm/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { createClient } from "@libsql/client";
import { is } from "drizzle-orm";
import { migrate as migrateSync } from "drizzle-orm/better-sqlite3/migrator";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { migrate as migrateD1 } from "drizzle-orm/d1/migrator";
import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";

import * as schema from "../db/schema/index.js";
import { traceSqlClient } from "../db/trace-libsql.js";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/** Any drizzle SQLite db — core's, a plugin's, a runtime's, sync or async. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MigratableDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

// Core's shipped history, at the package root: `../../migrations` from both
// `src/test/` and the `dist/test/` it compiles to.
export const CORE_MIGRATIONS = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

// One tracking table per history, named for the folder's owner — the package
// directory holding `migrations/`. drizzle applies only migrations newer than
// the newest it has recorded, so a plugin history sharing core's table would
// have every migration older than core's newest skipped.
function trackingTable(migrationsFolder: string): string {
  const owner = basename(dirname(migrationsFolder)).replace(/\W/g, "_");
  return `__drizzle_migrations_${owner}`;
}

// drizzle ships one migrator per driver: libsql's and D1's batch the whole
// history, the sync drivers' (better-sqlite3's, which the `node:sqlite` and
// `bun:sqlite` shims satisfy) wrap it in BEGIN/COMMIT.
async function migrate(
  db: MigratableDb,
  migrationsFolder: string,
): Promise<void> {
  const config: MigrationConfig = {
    migrationsFolder,
    migrationsTable: trackingTable(migrationsFolder),
  };
  if (is(db, LibSQLDatabase)) return migrateLibsql(db, config);
  if (is(db, DrizzleD1Database)) return migrateD1(db, config);
  migrateSync(db as BetterSQLite3Database, config);
}

/**
 * Apply a plugin's shipped migration history to `db` with drizzle's own
 * migrator. A plugin suite layers its history onto a core test db when its
 * FKs reference `entries` / `users`, or onto a bare `:memory:` db when it owns
 * every table it touches.
 */
export async function applyTestSchema(
  db: MigratableDb,
  migrationsFolder: string,
): Promise<void> {
  await migrate(db, migrationsFolder);
}

/** Apply core's shipped migration history — what a real install runs first. */
export async function applyCoreTestSchema(db: MigratableDb): Promise<void> {
  await migrate(db, CORE_MIGRATIONS);
}

/**
 * Per-test in-memory libsql database with the full core schema applied.
 * Pure JS — works on Node, Bun, Deno, CI without native deps.
 */
export async function createTestDb(): Promise<TestDb> {
  // Mirror the real adapter: unconditional per-query span tracing.
  const client = traceSqlClient(createClient({ url: ":memory:" }));
  const db = drizzle(client, { schema, casing: "snake_case" });
  await applyCoreTestSchema(db);
  return db;
}
