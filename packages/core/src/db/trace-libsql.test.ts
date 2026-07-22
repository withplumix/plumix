import type { Client } from "@libsql/client";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { createTelemetryCollector } from "../context/collector.js";
import { requestStore } from "../context/stores.js";
import { traceSqlClient } from "./trace-libsql.js";

describe("traceSqlClient", () => {
  function telemetryContext(): {
    telemetry: ReturnType<typeof createTelemetryCollector>;
    ctx: AppContext;
  } {
    const telemetry = createTelemetryCollector();
    return { telemetry, ctx: { telemetry } as unknown as AppContext };
  }

  function fakeClient(overrides: Record<string, unknown> = {}): Client {
    return {
      execute: () => Promise.resolve({ rows: [], rowsAffected: 0 }),
      batch: () => Promise.resolve([]),
      transaction: () =>
        Promise.resolve({
          execute: () => Promise.resolve({ rows: [], rowsAffected: 0 }),
          batch: () => Promise.resolve([]),
          commit: () => Promise.resolve(),
        }),
      ...overrides,
    } as unknown as Client;
  }

  test("times each execute as a kind-named db span", async () => {
    const { telemetry, ctx } = telemetryContext();
    const client = traceSqlClient(fakeClient());

    await requestStore.run(ctx, () =>
      client.execute({ sql: "select * from posts", args: [] }),
    );

    expect(telemetry.getSpans().map((s) => s.name)).toEqual(["db: select"]);
  });

  test("attaches sql, params, and row count as span attributes", async () => {
    const { telemetry, ctx } = telemetryContext();
    const client = traceSqlClient(
      fakeClient({
        execute: () =>
          Promise.resolve({ rows: [{ id: 1 }, { id: 2 }], rowsAffected: 0 }),
      }),
    );

    await requestStore.run(ctx, () =>
      client.execute({ sql: "select * from posts where id = ?", args: [7] }),
    );

    expect(telemetry.getSpans()[0]?.attributes).toEqual({
      "db.sql": "select * from posts where id = ?",
      "db.params": [7],
      "db.rows": 2,
    });
  });

  test("reports affected rows for a write returning no rows", async () => {
    const { telemetry, ctx } = telemetryContext();
    const client = traceSqlClient(
      fakeClient({
        execute: () => Promise.resolve({ rows: [], rowsAffected: 1 }),
      }),
    );

    await requestStore.run(ctx, () =>
      client.execute({ sql: "insert into posts (title) values (?)", args: [] }),
    );

    const [span] = telemetry.getSpans();
    expect(span?.attributes["db.rows"]).toBe(1);
    // No bound params → no params attribute, rather than an empty list.
    expect(span?.attributes).not.toHaveProperty("db.params");
  });

  test("times a batch as one span, labelled by kind and count", async () => {
    const { telemetry, ctx } = telemetryContext();
    const client = traceSqlClient(fakeClient());

    await requestStore.run(ctx, () =>
      client.batch([
        { sql: "select * from posts", args: [] },
        { sql: "select * from terms", args: [] },
      ]),
    );

    expect(telemetry.getSpans().map((s) => s.name)).toEqual(["db: select (2)"]);
  });

  test("batch span carries per-statement sql/params and total rows", async () => {
    const { telemetry, ctx } = telemetryContext();
    const client = traceSqlClient(
      fakeClient({
        batch: () =>
          Promise.resolve([
            { rows: [{}, {}], rowsAffected: 0 },
            { rows: [{}], rowsAffected: 0 },
          ]),
      }),
    );

    await requestStore.run(ctx, () =>
      client.batch([
        { sql: "select * from posts where author_id = ?", args: [1] },
        { sql: "select * from terms", args: [] },
      ]),
    );

    expect(telemetry.getSpans()[0]?.attributes).toEqual({
      "db.batch": [
        { sql: "select * from posts where author_id = ?", params: [1] },
        { sql: "select * from terms", params: [] },
      ],
      "db.rows": 3,
    });
  });

  test("times queries inside a transaction, attributes included", async () => {
    const { telemetry, ctx } = telemetryContext();
    const client = traceSqlClient(
      fakeClient({
        transaction: () =>
          Promise.resolve({
            execute: () => Promise.resolve({ rows: [], rowsAffected: 1 }),
            batch: () => Promise.resolve([]),
            commit: () => Promise.resolve(),
          }),
      }),
    );

    await requestStore.run(ctx, async () => {
      const tx = await client.transaction("write");
      await tx.execute({
        sql: "update posts set title = ? where id = ?",
        args: ["t", 1],
      });
      await tx.commit();
    });

    const spans = telemetry.getSpans();
    expect(spans.map((s) => s.name)).toEqual(["db: update"]);
    expect(spans[0]?.attributes).toEqual({
      "db.sql": "update posts set title = ? where id = ?",
      "db.params": ["t", 1],
      "db.rows": 1,
    });
  });

  test("passes calls straight through outside a request context", async () => {
    const client = traceSqlClient(fakeClient());
    await expect(
      client.execute({ sql: "select 1", args: [] }),
    ).resolves.toEqual({ rows: [], rowsAffected: 0 });
  });
});
