import type { SQL } from "drizzle-orm";
import type { AppContext } from "plumix";
import { sql } from "drizzle-orm";
import { requestStore } from "plumix";
import { createTestContext, createTestDb } from "plumix/test";
import { describe, expect, test } from "vitest";

import { demoDatabase } from "./database.js";
import { DEMO_SHOWCASE_NAME } from "./session.js";

// A consumer without `sample` votes yes, so the context carries a live collector
// and the driver's spans land where the assertions read them.
async function sampledContext(): Promise<AppContext> {
  return createTestContext({
    db: await createTestDb(),
    telemetry: { consumers: [{ id: "test" }] },
  });
}

function fakeEnv(rows: unknown[][]): Record<string, unknown> {
  return {
    DEMO: {
      idFromName: (name: string) => name,
      get: () => ({
        query: () => Promise.resolve({ rows }),
        batch: (queries: unknown[]) =>
          Promise.resolve(queries.map(() => ({ rows }))),
      }),
    },
  };
}

describe("demoDatabase() — query span tracing", () => {
  test("times each proxied query as a db span with sql/params/rows attributes", async () => {
    const ctx = await sampledContext();
    const db = demoDatabase({ binding: "DEMO" }).connect(
      fakeEnv([
        [1, "a"],
        [2, "b"],
      ]),
      new Request("https://cms.example"),
      {},
    ).db as { all(query: SQL): Promise<unknown> };

    await requestStore.run(ctx, async () => {
      await db.all(sql`select id from posts where id = ${7}`);
    });

    const spans = ctx.telemetry.getSpans();

    expect(spans.map((s) => s.name)).toEqual(["db: select"]);
    expect(spans[0]?.attributes).toEqual({
      "db.sql": "select id from posts where id = ?",
      "db.params": [7],
      "db.rows": 2,
    });
  });

  test("times a batch as one span with summed rows", async () => {
    const ctx = await sampledContext();
    const db = demoDatabase({ binding: "DEMO" }).connect(
      fakeEnv([[1]]),
      new Request("https://cms.example"),
      {},
    ).db as {
      batch(queries: unknown[]): Promise<unknown>;
      run(query: SQL): Promise<unknown>;
    };

    await requestStore.run(ctx, () =>
      db.batch([db.run(sql`select 1`), db.run(sql`select 2`)]),
    );

    const spans = ctx.telemetry.getSpans();

    expect(spans.map((s) => s.name)).toEqual(["db: select (2)"]);
    expect(spans[0]?.attributes["db.batch"]).toEqual([
      { sql: "select 1", params: [] },
      { sql: "select 2", params: [] },
    ]);
    expect(spans[0]?.attributes["db.rows"]).toBe(2);
  });
});

describe("demoDatabase() — per-visitor routing", () => {
  // The handler binds `connect` once, so a visitor's own DO can only be
  // resolved through `connectRequest`. Without it every visitor would share
  // whichever DO the handler's first request happened to name.
  test("routes each request to the durable object its own cookie names", () => {
    const named: string[] = [];
    const env = {
      DEMO: {
        idFromName: (name: string) => {
          named.push(name);
          return name;
        },
        get: () => ({
          query: () => Promise.resolve({ rows: [] }),
          batch: () => Promise.resolve([]),
        }),
      },
    };
    const adapter = demoDatabase({ binding: "DEMO" });
    const forVisitor = (token?: string) =>
      adapter.connectRequest?.({
        env,
        request: new Request("https://cms.example", {
          headers: token ? { cookie: `plumix_demo=${token}` } : {},
        }),
        schema: {},
        isAuthenticated: false,
        isWrite: false,
      });

    forVisitor("alice");
    forVisitor("bob");
    forVisitor();

    expect(named).toEqual(["alice", "bob", DEMO_SHOWCASE_NAME]);
  });
});
