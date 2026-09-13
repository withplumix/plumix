import { beforeAll, describe, expect, test, vi } from "vitest";

import type { AppContext, Db } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { traceDbQuerySync } from "./trace.js";

const identity = (rows: number): number => rows;

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

// A consumer without `sample` votes yes, so the context carries a live collector.
const sampledContext = (): AppContext =>
  createTestContext({ db, telemetry: { consumers: [{ id: "test" }] } });

describe("traceDbQuerySync", () => {
  test("names the span by kind and carries sql, params and row count", () => {
    const ctx = sampledContext();

    const rows = requestStore.run(ctx, () =>
      traceDbQuerySync(
        { sql: "select * from posts where id = ?", params: [7] },
        () => [{ id: 7 }],
        (result) => result.length,
      ),
    );

    expect(rows).toEqual([{ id: 7 }]);
    const [span] = ctx.telemetry.getSpans();
    expect(span?.name).toBe("db: select");
    expect(span?.attributes).toEqual({
      "db.sql": "select * from posts where id = ?",
      "db.params": [7],
      "db.rows": 1,
    });
  });

  test("omits the params attribute rather than recording an empty list", () => {
    const ctx = sampledContext();

    requestStore.run(ctx, () =>
      traceDbQuerySync(
        { sql: "delete from posts", params: [] },
        () => 3,
        identity,
      ),
    );

    expect(ctx.telemetry.getSpans()[0]?.attributes).not.toHaveProperty(
      "db.params",
    );
  });

  test("records a throwing query as a failed span and rethrows unchanged", () => {
    const ctx = sampledContext();
    const boom = new Error("constraint failed");

    expect(() =>
      requestStore.run(ctx, () =>
        traceDbQuerySync(
          { sql: "insert into posts", params: [] },
          () => {
            throw boom;
          },
          identity,
        ),
      ),
    ).toThrow(boom);

    const [span] = ctx.telemetry.getSpans();
    expect(span?.status).toBe("error");
    expect(span?.error?.message).toBe("constraint failed");
  });

  // The reason the wrap is applied unconditionally: on a request nobody
  // sampled, the no-op handle drops `set`, so a param never reaches the
  // JSON-safe serializer.
  test("never serializes params on an unsampled request", () => {
    const at = new Date(0);
    const serialize = vi.spyOn(at, "toISOString");

    requestStore.run(createTestContext({ db }), () =>
      traceDbQuerySync(
        { sql: "select * from posts where at = ?", params: [at] },
        () => [],
        (rows) => rows.length,
      ),
    );
    expect(serialize).not.toHaveBeenCalled();

    requestStore.run(sampledContext(), () =>
      traceDbQuerySync(
        { sql: "select * from posts where at = ?", params: [at] },
        () => [],
        (rows) => rows.length,
      ),
    );
    expect(serialize).toHaveBeenCalled();
  });

  test("runs the query untouched outside a request", () => {
    expect(
      traceDbQuerySync({ sql: "select 1", params: [] }, () => 1, identity),
    ).toBe(1);
  });
});
