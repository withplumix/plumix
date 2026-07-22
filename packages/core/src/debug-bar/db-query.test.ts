import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { createTelemetryCollector } from "./collector.js";
import { createDebugSqlLogger } from "./db-query.js";

describe("createDebugSqlLogger", () => {
  test("records each query drizzle logs to the database bucket", () => {
    const telemetry = createTelemetryCollector(undefined);
    const ctx = { telemetry } as unknown as AppContext;
    const logger = createDebugSqlLogger();

    requestStore.run(ctx, () => {
      logger.logQuery("select * from t where id = ?", [7]);
    });

    expect(telemetry.get("database").map((r) => r.data)).toEqual([
      { sql: "select * from t where id = ?", params: [7] },
    ]);
  });

  test("is a no-op outside a request context", () => {
    expect(() => createDebugSqlLogger().logQuery("select 1", [])).not.toThrow();
  });
});
