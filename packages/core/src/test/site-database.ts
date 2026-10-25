import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient, LibsqlError } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../db/schema/index.js";
import { traceSqlClient } from "../db/trace-libsql.js";
import { applyTestSchema } from "./harness.js";

export interface SiteDatabase {
  readonly db: LibSQLDatabase<typeof schema>;
  /** Empty every table the migrations made, as a fresh migration leaves it. */
  readonly reset: () => Promise<void>;
}

/**
 * An in-memory database with each history in `migrationFolders` applied, in
 * order.
 */
export async function createSiteDatabase(
  migrationFolders: readonly string[],
): Promise<SiteDatabase> {
  // Mirror the real adapter: unconditional per-query span tracing.
  const client = traceSqlClient(createClient({ url: ":memory:" }));
  const db = drizzle(client, { schema, casing: "snake_case" });
  for (const folder of migrationFolders) await applyTestSchema(db, folder);
  const script = await resetScript(client);
  return {
    db,
    reset: async () => {
      try {
        await client.executeMultiple(script);
      } catch (error) {
        // The database's one connection is held until the transaction settles.
        if (
          error instanceof LibsqlError &&
          error.code === "TRANSACTION_ACTIVE"
        ) {
          throw new Error(
            "A transaction is still open, so the test database cannot be reset. Commit or roll back every transaction a test opens before it ends.",
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}

interface TableRow {
  readonly name: string;
  readonly sql: string;
}

/**
 * Empties every table but the migrators' records, and `sqlite_sequence` so ids
 * restart. A table a trigger writes into is emptied again last, since emptying
 * the others fires the trigger.
 */
async function resetScript(client: Client): Promise<string> {
  const tables = (
    await client.execute(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_migrations%'",
    )
  ).rows as unknown as readonly TableRow[];
  // A full-text index is cleared by its own command; its shadow tables are its.
  const virtual = tables
    .filter((table) => /^CREATE VIRTUAL TABLE/i.test(table.sql))
    .map((table) => table.name);
  const plain = tables
    .map((table) => table.name)
    .filter(
      (name) =>
        !virtual.some(
          (index) => name === index || name.startsWith(`${index}_`),
        ),
    );
  const triggers = (
    await client.execute("SELECT sql FROM sqlite_master WHERE type = 'trigger'")
  ).rows as unknown as readonly { readonly sql: string }[];
  const written = new Set(
    triggers.flatMap(({ sql }) =>
      [...sql.matchAll(/INSERT\s+INTO\s+["`]?(\w+)/gi)].map(([, name]) => name),
    ),
  );
  const hasSequence = (
    await client.execute(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'",
    )
  ).rows.length;
  return [
    "PRAGMA foreign_keys = OFF",
    ...plain.map((name) => `DELETE FROM "${name}"`),
    ...plain
      .filter((name) => written.has(name))
      .map((name) => `DELETE FROM "${name}"`),
    ...virtual.map(
      (name) => `INSERT INTO "${name}"("${name}") VALUES ('delete-all')`,
    ),
    ...(hasSequence ? ["DELETE FROM sqlite_sequence"] : []),
    "PRAGMA foreign_keys = ON",
  ].join(";\n");
}
