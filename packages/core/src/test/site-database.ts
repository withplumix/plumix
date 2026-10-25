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

interface Named {
  readonly name: string;
}

/**
 * Empties every table but the migrators' records, and `sqlite_sequence` so ids
 * restart. A table a trigger writes into is emptied again last, since emptying
 * the others fires the trigger.
 */
async function resetScript(client: Client): Promise<string> {
  const { virtual, shadow } = await fullTextTables(client);
  const tables = (
    (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_migrations%'",
      )
    ).rows as unknown as readonly Named[]
  ).map((row) => row.name);
  const plain = tables.filter(
    (name) => !virtual.includes(name) && !shadow.includes(name),
  );
  const triggers = (
    (
      await client.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'trigger'",
      )
    ).rows as unknown as readonly { readonly sql: string }[]
  ).map((row) => row.sql);
  const written = new Set(
    triggers.flatMap((sql) =>
      [...sql.matchAll(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`]?(\w+)/gi)].map(
        ([, name]) => name,
      ),
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

/** A full-text table is cleared by its own command, which empties its shadows. */
async function fullTextTables(
  client: Client,
): Promise<{ virtual: string[]; shadow: string[] }> {
  const listed = (await client.execute("PRAGMA table_list"))
    .rows as unknown as readonly (Named & { readonly type: string })[];
  const named = (type: string): string[] =>
    listed.filter((row) => row.type === type).map((row) => row.name);
  return { virtual: named("virtual"), shadow: named("shadow") };
}
