import { createClient } from "@libsql/client";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../db/schema/index.js";
import { traceSqlClient } from "../db/trace-libsql.js";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

type SchemaModule = Record<string, unknown>;

/** Narrow enough that any drizzle db — core's or a plugin's — satisfies it. */
type SqlRunner = Pick<TestDb, "run">;

// Compiling a schema costs ~100ms, and every test in a file re-creates its
// db; keyed by the module object so core and each plugin cache separately.
const compiled = new WeakMap<SchemaModule, Promise<string[]>>();

// drizzle-kit's `api` surface is loosely typed (`SQLiteSchema` is opaque);
// we treat it as a black-box snapshot blob and only read its `id` field.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
async function compileSchemaSql(schemaModule: SchemaModule): Promise<string[]> {
  // Empty ↔ current snapshot diff yields the full create-from-scratch SQL.
  // `casing: "snake_case"` matches drizzle.config.ts so column names line up.
  const empty = await generateSQLiteDrizzleJson({}, undefined, "snake_case");
  const current = await generateSQLiteDrizzleJson(
    schemaModule,
    empty.id,
    "snake_case",
  );
  return generateSQLiteMigration(empty, current);
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

/**
 * Create the tables a drizzle schema module declares on `db`. A plugin suite
 * layers its schema onto a core test db when its FKs reference `entries` /
 * `users`, or onto a bare `:memory:` db when it owns every table it touches.
 */
export async function applyTestSchema(
  db: SqlRunner,
  schemaModule: SchemaModule,
): Promise<void> {
  const statements =
    compiled.get(schemaModule) ?? compileSchemaSql(schemaModule);
  compiled.set(schemaModule, statements);
  for (const statement of await statements) await db.run(sql.raw(statement));
}

/**
 * Per-test in-memory libsql database with the full core schema applied.
 * Pure JS — works on Node, Bun, Deno, CI without native deps.
 */
export async function createTestDb(): Promise<TestDb> {
  // Mirror the real adapter: unconditional per-query span tracing.
  const client = traceSqlClient(createClient({ url: ":memory:" }));
  const db = drizzle(client, { schema, casing: "snake_case" });
  await applyTestSchema(db, schema);
  return db;
}
