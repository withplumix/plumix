import type { Client } from "@libsql/client";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { createTelemetryCollector } from "../context/collector.js";
import { requestStore } from "../context/stores.js";
import { traceSqlClient } from "./trace-libsql.js";

describe("traceSqlClient", () => {
  function fakeClient(): Client {
    return {
      execute: () => Promise.resolve({ rows: [] }),
      batch: () => Promise.resolve([]),
    } as unknown as Client;
  }

  test("times each execute as a kind-named db span", async () => {
    const telemetry = createTelemetryCollector();
    const ctx = { telemetry } as unknown as AppContext;
    const client = traceSqlClient(fakeClient());

    await requestStore.run(ctx, () =>
      client.execute({ sql: "select * from posts", args: [] }),
    );

    expect(telemetry.getSpans().map((s) => s.name)).toEqual(["db: select"]);
  });

  test("times a batch as one span, labelled by kind and count", async () => {
    const telemetry = createTelemetryCollector();
    const ctx = { telemetry } as unknown as AppContext;
    const client = traceSqlClient(fakeClient());

    await requestStore.run(ctx, () =>
      client.batch([
        { sql: "select * from posts", args: [] },
        { sql: "select * from terms", args: [] },
      ]),
    );

    expect(telemetry.getSpans().map((s) => s.name)).toEqual(["db: select (2)"]);
  });

  test("passes calls straight through outside a request context", async () => {
    const client = traceSqlClient(fakeClient());
    await expect(
      client.execute({ sql: "select 1", args: [] }),
    ).resolves.toEqual({ rows: [] });
  });
});
