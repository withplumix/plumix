import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import { createTelemetryCollector } from "../context/collector.js";
import { requestStore } from "../context/stores.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { traceDbQuerySync } from "./trace.js";

const identity = (rows: number): number => rows;

const contextWith = (telemetry: AppContext["telemetry"]): AppContext =>
  ({ telemetry }) as unknown as AppContext;

describe("traceDbQuerySync", () => {
  test("names the span by kind and carries sql, params and row count", () => {
    const telemetry = createTelemetryCollector();

    const rows = requestStore.run(contextWith(telemetry), () =>
      traceDbQuerySync(
        { sql: "select * from posts where id = ?", params: [7] },
        () => [{ id: 7 }],
        (result) => result.length,
      ),
    );

    expect(rows).toEqual([{ id: 7 }]);
    const [span] = telemetry.getSpans();
    expect(span?.name).toBe("db: select");
    expect(span?.attributes).toEqual({
      "db.sql": "select * from posts where id = ?",
      "db.params": [7],
      "db.rows": 1,
    });
  });

  test("omits the params attribute rather than recording an empty list", () => {
    const telemetry = createTelemetryCollector();

    requestStore.run(contextWith(telemetry), () =>
      traceDbQuerySync(
        { sql: "delete from posts", params: [] },
        () => 3,
        identity,
      ),
    );

    expect(telemetry.getSpans()[0]?.attributes).not.toHaveProperty("db.params");
  });

  test("records a throwing query as a failed span and rethrows unchanged", () => {
    const telemetry = createTelemetryCollector();
    const boom = new Error("constraint failed");

    expect(() =>
      requestStore.run(contextWith(telemetry), () =>
        traceDbQuerySync(
          { sql: "insert into posts", params: [] },
          () => {
            throw boom;
          },
          identity,
        ),
      ),
    ).toThrow(boom);

    const [span] = telemetry.getSpans();
    expect(span?.status).toBe("error");
    expect(span?.error?.message).toBe("constraint failed");
  });

  // The reason the wrap is applied unconditionally: on a request nobody
  // sampled, the no-op handle drops `set`, so a param never reaches the
  // JSON-safe serializer.
  test("never serializes params on an unsampled request", () => {
    const at = new Date(0);
    const serialize = vi.spyOn(at, "toISOString");

    requestStore.run(contextWith(NOOP_TELEMETRY), () =>
      traceDbQuerySync(
        { sql: "select * from posts where at = ?", params: [at] },
        () => [],
        (rows) => rows.length,
      ),
    );
    expect(serialize).not.toHaveBeenCalled();

    requestStore.run(contextWith(createTelemetryCollector()), () =>
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
