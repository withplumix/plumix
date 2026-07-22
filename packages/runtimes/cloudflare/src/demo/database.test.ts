import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requestStore } from "plumix";
import { describe, expect, test } from "vitest";

import { demoDatabase } from "./database.js";

// Captures spans through the TelemetrySpanHandle contract — the same surface
// the real collector implements — so assertions stay driver-level.
function spanCapture(): {
  ctx: unknown;
  spans: { name: string; attributes: Record<string, unknown> }[];
} {
  const spans: { name: string; attributes: Record<string, unknown> }[] = [];
  const telemetry = {
    span: (name: string, fn: (s: unknown) => unknown) => {
      const attributes: Record<string, unknown> = {};
      spans.push({ name, attributes });
      return fn({
        set: (key: string, value: unknown) => {
          attributes[key] =
            typeof value === "function" ? (value as () => unknown)() : value;
        },
      });
    },
  };
  return { ctx: { telemetry }, spans };
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
    const { ctx, spans } = spanCapture();
    const db = demoDatabase({ binding: "DEMO" }).connect(
      fakeEnv([
        [1, "a"],
        [2, "b"],
      ]),
      new Request("https://cms.example"),
      {},
    ).db as { all(query: SQL): Promise<unknown> };

    await requestStore.run(ctx as never, async () => {
      await db.all(sql`select id from posts where id = ${7}`);
    });

    expect(spans.map((s) => s.name)).toEqual(["db: select"]);
    expect(spans[0]?.attributes).toEqual({
      "db.sql": "select id from posts where id = ?",
      "db.params": [7],
      "db.rows": 2,
    });
  });

  test("times a batch as one span with summed rows", async () => {
    const { ctx, spans } = spanCapture();
    const db = demoDatabase({ binding: "DEMO" }).connect(
      fakeEnv([[1]]),
      new Request("https://cms.example"),
      {},
    ).db as {
      batch(queries: unknown[]): Promise<unknown>;
      run(query: SQL): Promise<unknown>;
    };

    await requestStore.run(ctx as never, () =>
      db.batch([db.run(sql`select 1`), db.run(sql`select 2`)]),
    );

    expect(spans.map((s) => s.name)).toEqual(["db: select (2)"]);
    expect(spans[0]?.attributes["db.batch"]).toEqual([
      { sql: "select 1", params: [] },
      { sql: "select 2", params: [] },
    ]);
    expect(spans[0]?.attributes["db.rows"]).toBe(2);
  });
});
