import type { Client } from "@libsql/client";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { createDebugCollector } from "./collector.js";
import { createDebugSqlLogger, traceSqlClient } from "./db-query.js";

describe("createDebugSqlLogger", () => {
  test("records each query drizzle logs to the database bucket", () => {
    const debug = createDebugCollector(undefined);
    const ctx = { debug } as unknown as AppContext;
    const logger = createDebugSqlLogger();

    requestStore.run(ctx, () => {
      logger.logQuery("select * from t where id = ?", [7]);
    });

    expect(debug.get("database")).toEqual([
      { sql: "select * from t where id = ?", params: [7] },
    ]);
  });

  test("is a no-op outside a request context", () => {
    expect(() => createDebugSqlLogger().logQuery("select 1", [])).not.toThrow();
  });
});

describe("traceSqlClient", () => {
  function fakeClient(): Client {
    return {
      execute: () => Promise.resolve({ rows: [] }),
      batch: () => Promise.resolve([]),
    } as unknown as Client;
  }

  test("times each execute as a kind-named db span", async () => {
    const debug = createDebugCollector(undefined);
    const ctx = { debug } as unknown as AppContext;
    const client = traceSqlClient(fakeClient());

    await requestStore.run(ctx, () =>
      client.execute({ sql: "select * from posts", args: [] }),
    );

    expect(debug.getSpans().map((s) => s.name)).toEqual(["db: select"]);
  });

  test("times a batch as one span, labelled by kind and count", async () => {
    const debug = createDebugCollector(undefined);
    const ctx = { debug } as unknown as AppContext;
    const client = traceSqlClient(fakeClient());

    await requestStore.run(ctx, () =>
      client.batch([
        { sql: "select * from posts", args: [] },
        { sql: "select * from terms", args: [] },
      ]),
    );

    expect(debug.getSpans().map((s) => s.name)).toEqual(["db: select (2)"]);
  });

  test("passes calls straight through outside a request context", async () => {
    const client = traceSqlClient(fakeClient());
    await expect(
      client.execute({ sql: "select 1", args: [] }),
    ).resolves.toEqual({ rows: [] });
  });
});
