import type { Client, InArgs, InStatement, Transaction } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { D1_MAX_BOUND_PARAMETERS } from "../db/d1-chunk.js";
import * as schema from "../db/schema/index.js";
import { traceSqlClient } from "../db/trace-libsql.js";
import { applyTestSchema } from "./harness.js";

export interface SiteDatabase {
  readonly db: LibSQLDatabase<typeof schema>;
  /** Empty every table the migrations made, as a fresh migration leaves it. */
  readonly reset: () => Promise<void>;
}

export interface SiteDatabaseOptions {
  /** Refuse what D1 refuses in production, for a site whose config is `d1()`. */
  readonly d1?: boolean;
}

/**
 * An in-memory database with each history in `migrationFolders` applied, in
 * order.
 */
export async function createSiteDatabase(
  migrationFolders: readonly string[],
  options: SiteDatabaseOptions = {},
): Promise<SiteDatabase> {
  const traced = traceSqlClient(createClient({ url: ":memory:" }));
  const handle = forwardingHandle(
    options.d1 === true ? refusingWhatD1Refuses(traced) : traced,
  );
  const db = drizzle(handle.client, { schema, casing: "snake_case" });
  for (const folder of migrationFolders) await applyTestSchema(db, folder);
  const script = await resetScript(handle.client);
  return {
    db,
    reset: async () => {
      const open = handle.openTransactions();
      if (open > 0) {
        throw new Error(
          `${String(open)} transaction${open === 1 ? " is" : "s are"} still open, so the test database cannot be reset. Commit or roll back every transaction a test opens before it ends.`,
        );
      }
      await handle.client.executeMultiple(script);
    },
  };
}

/**
 * Fails a statement before it runs wherever D1 would, so a query that breaks
 * in production breaks in the test too.
 */
function refusingWhatD1Refuses(target: Client): Client {
  const execute = (
    statement: InStatement | string,
    args?: InArgs,
  ): ReturnType<Client["execute"]> => {
    if (typeof statement === "string") {
      assertWithinD1Cap(args);
      return target.execute(statement, args);
    }
    assertWithinD1Cap(statement.args);
    return target.execute(statement);
  };
  const batch: Client["batch"] = (statements, mode) => {
    for (const statement of statements) {
      assertWithinD1Cap(
        Array.isArray(statement)
          ? statement[1]
          : typeof statement === "string"
            ? undefined
            : statement.args,
      );
    }
    return target.batch(statements, mode);
  };
  const transaction = (): Promise<Transaction> =>
    Promise.reject(
      new Error(
        "D1 refuses an interactive transaction, so db.transaction fails on it in production. Send the writes together with db.batch, which D1 runs as one transaction.",
      ),
    );
  return new Proxy(target, {
    get(on, key) {
      if (key === "execute") return execute;
      if (key === "batch") return batch;
      if (key === "transaction") return transaction;
      return forwarded(on, key);
    },
  });
}

function assertWithinD1Cap(args: InArgs | undefined): void {
  if (args === undefined) return;
  const bound = Array.isArray(args) ? args.length : Object.keys(args).length;
  if (bound <= D1_MAX_BOUND_PARAMETERS) return;
  throw new Error(
    `D1 binds at most ${String(D1_MAX_BOUND_PARAMETERS)} parameters in one statement, and this one binds ${String(bound)}. Chunk the ids with chunkForD1 from plumix/db and run one statement per chunk, or send the statements together with db.batch.`,
  );
}

interface ForwardingHandle {
  readonly client: Client;
  readonly openTransactions: () => number;
}

/**
 * The client the site holds for the file's lifetime. It forwards every call,
 * and counts the transactions opened through it until each settles.
 */
function forwardingHandle(target: Client): ForwardingHandle {
  let open = 0;
  const transaction = async (
    ...args: Parameters<Client["transaction"]>
  ): Promise<Transaction> => {
    const tx = await target.transaction(...args);
    open += 1;
    let settled = false;
    const settle = <T>(run: () => T): T => {
      if (!settled) {
        settled = true;
        open -= 1;
      }
      return run();
    };
    return new Proxy(tx, {
      get(on, key) {
        if (key === "commit") return () => settle(() => on.commit());
        if (key === "rollback") return () => settle(() => on.rollback());
        if (key === "close") return () => settle(() => on.close());
        return forwarded(on, key);
      },
    });
  };
  const client = new Proxy(target, {
    get(on, key) {
      if (key === "transaction") return transaction;
      return forwarded(on, key);
    },
  });
  return { client, openTransactions: () => open };
}

/** Bound to the target, since libsql's methods read its private fields. */
function forwarded(on: object, key: string | symbol): unknown {
  const value: unknown = Reflect.get(on, key, on);
  return typeof value === "function"
    ? (value as (...args: unknown[]) => unknown).bind(on)
    : value;
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
