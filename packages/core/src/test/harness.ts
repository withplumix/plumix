import { createClient } from "@libsql/client";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../db/schema/index.js";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const schemaImports = schema as unknown as Record<string, unknown>;

let cachedStatements: string[] | null = null;

// drizzle-kit's `api` surface is loosely typed (`SQLiteSchema` is opaque);
// we treat it as a black-box snapshot blob and only read its `id` field.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
async function compileSchemaSql(): Promise<string[]> {
  if (cachedStatements) return cachedStatements;
  // Empty ↔ current snapshot diff yields the full create-from-scratch SQL.
  // `casing: "snake_case"` matches drizzle.config.ts so column names line up.
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
 * Per-test in-memory libsql database with the full core schema applied.
 * Pure JS — works on Node, Bun, Deno, CI without native deps.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema, casing: "snake_case" });
  const statements = await compileSchemaSql();
  for (const stmt of statements) await db.run(sql.raw(stmt));
  return db;
}
