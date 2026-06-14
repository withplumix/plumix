import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { libsql } from "./libsql.js";

describe("libsql() adapter", () => {
  test("connect() returns a working drizzle db bound to the url", async () => {
    const adapter = libsql({ url: ":memory:" });
    const { db } = adapter.connect({}, new Request("https://x/"), {});
    const rows = await (db as LibSQLDatabase).all<{ one: number }>(
      sql`select 1 as one`,
    );
    expect(rows).toEqual([{ one: 1 }]);
  });

  test("identifies as 'libsql' and exposes its config", () => {
    const adapter = libsql({ url: "libsql://db.turso.io", authToken: "tok" });
    expect(adapter.kind).toBe("libsql");
    expect(adapter.config).toEqual({
      url: "libsql://db.turso.io",
      authToken: "tok",
    });
  });

  test("has no connectRequest hook (single endpoint, strong consistency)", () => {
    expect(libsql({ url: ":memory:" }).connectRequest).toBeUndefined();
  });

  test("declares no required env bindings (connection comes from config)", () => {
    expect(libsql({ url: ":memory:" }).requiredBindings).toBeUndefined();
  });

  test("resolves connection config from the runtime env (resolver form)", async () => {
    const adapter = libsql((env) => ({
      url: (env as { DB_URL: string }).DB_URL,
    }));
    const { db } = adapter.connect(
      { DB_URL: ":memory:" },
      new Request("https://x/"),
      {},
    );
    const rows = await (db as LibSQLDatabase).all<{ one: number }>(
      sql`select 1 as one`,
    );
    expect(rows).toEqual([{ one: 1 }]);
  });

  test("does not call the resolver until connect() (env is request-time)", () => {
    let called = false;
    libsql(() => {
      called = true;
      return { url: ":memory:" };
    });
    expect(called).toBe(false);
  });

  test("memoizes the client — the resolver runs once across requests", () => {
    let calls = 0;
    const adapter = libsql(() => {
      calls += 1;
      return { url: ":memory:" };
    });
    adapter.connect({}, new Request("https://x/"), {});
    adapter.connect({}, new Request("https://x/"), {});
    expect(calls).toBe(1);
  });

  test("connect() applies snake_case column casing", async () => {
    const adapter = libsql({ url: ":memory:" });
    const { db } = adapter.connect({}, new Request("https://x/"), {});
    const lib = db as LibSQLDatabase;
    await lib.run(sql`create table t (first_name text)`);
    await lib.run(sql`insert into t (first_name) values ('ada')`);
    const rows = await lib.all<{ first_name: string }>(sql`select * from t`);
    expect(rows).toEqual([{ first_name: "ada" }]);
  });
});
