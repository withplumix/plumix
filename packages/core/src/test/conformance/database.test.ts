import type { Client, InStatement } from "@libsql/client";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, test } from "vitest";

import type { DatabaseAdapter } from "../../runtime/contract/slots.js";
import { failingCases } from "./case.js";
import { databaseContractCases } from "./database.js";

/**
 * libsql is the reference driver; each adapter below breaks it in one way a
 * real driver has been seen to.
 */
function adapterOver(client: Client): DatabaseAdapter {
  return {
    kind: "broken",
    connect: (_env, _request, schema) => ({
      db: drizzle(client, { schema, casing: "snake_case" }),
      close: () => client.close(),
    }),
  };
}

/**
 * Reports how far `total_changes()` moved across the statement, which is how
 * D1 counted: rows a trigger wrote are counted as the statement's own.
 */
function triggerCountingClient(): Client {
  const client = createClient({ url: ":memory:" });
  const total = async (): Promise<number> =>
    Number((await client.execute("SELECT total_changes()")).rows[0]?.[0]);
  const execute = async (statement: InStatement) => {
    const before = await total();
    const result = await client.execute(statement);
    return { ...result, rowsAffected: (await total()) - before };
  };
  return new Proxy(client, {
    get: (target, key) => {
      if (key === "execute") return execute;
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function"
        ? (value as (this: Client) => unknown).bind(target)
        : value;
    },
  });
}

/**
 * Leaves foreign keys off, as a driver that never turns them on does.
 * libsql's own `migrate` turns them back on when it finishes, so they go off
 * again after it.
 */
function foreignKeysOffClient(): Client {
  const client = createClient({ url: ":memory:" });
  const migrate = async (statements: InStatement[]) => {
    const results = await client.migrate(statements);
    await client.execute("PRAGMA foreign_keys = OFF");
    return results;
  };
  return new Proxy(client, {
    get: (target, key) => {
      if (key === "migrate") return migrate;
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function"
        ? (value as (this: Client) => unknown).bind(target)
        : value;
    },
  });
}

describe("database contract cases", () => {
  test("fail a connection that leaves foreign keys off", async () => {
    const failed = await failingCases(databaseContractCases, {
      connect: async () => {
        const client = foreignKeysOffClient();
        await client.execute("PRAGMA foreign_keys = OFF");
        return { adapter: adapterOver(client) };
      },
    });
    expect(failed).toEqual([
      "deleting a user cascades to its tokens and sessions",
    ]);
  });

  test("fail a driver that counts the rows a trigger wrote", async () => {
    const failed = await failingCases(databaseContractCases, {
      connect: () => ({ adapter: adapterOver(triggerCountingClient()) }),
    });
    expect(failed).toEqual([
      "rowsAffected leaves out the rows a trigger wrote",
    ]);
  });
});
