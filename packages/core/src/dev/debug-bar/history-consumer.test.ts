import { beforeAll, describe, expect, test } from "vitest";

import type { AppContext, Db } from "../../context/app.js";
import type { TelemetrySnapshot } from "../../context/telemetry.js";
import type { CreateTestContextOptions } from "../../test/context.js";
import { createTestContext } from "../../test/context.js";
import { createTestDb } from "../../test/harness.js";
import { debugHistoryConsumer } from "./history-consumer.js";
import { createDebugHistoryStore } from "./history.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

function ctxWith(
  overrides: Omit<CreateTestContextOptions, "db"> = {},
): AppContext {
  return createTestContext({
    db,
    request: new Request("https://cms.example/_plumix/rpc/entry/list", {
      method: "POST",
    }),
    origin: "https://cms.example",
    ...overrides,
  });
}

function envelope(
  overrides: Partial<TelemetrySnapshot["request"]> = {},
): TelemetrySnapshot {
  return {
    request: {
      requestId: "req-42",
      method: "POST",
      url: "https://cms.example/_plumix/rpc/entry/list",
      status: 200,
      startedAt: 1_000,
      durationMs: 7,
      ...overrides,
    },
    spans: [],
    records: {},
    dropped: { spans: 0, records: {} },
  };
}

describe("debugHistoryConsumer", () => {
  test("captures a finished request into the store, keyed by request id", () => {
    const store = createDebugHistoryStore();
    const consumer = debugHistoryConsumer(store);

    void consumer.onRequestEnd?.(envelope(), ctxWith());

    const entry = store.find("req-42");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe(200);
    expect(entry?.durationMs).toBe(7);
    expect(entry?.startedAt).toBe(1_000);
    // Non-HTML path is captured all the same — the whole point of history.
    expect(entry?.snapshot.context.path).toBe("/_plumix/rpc/entry/list");
    expect(entry?.snapshot.context.method).toBe("POST");
  });

  test("captures a 5xx request", () => {
    const store = createDebugHistoryStore();
    void debugHistoryConsumer(store).onRequestEnd?.(
      envelope({ status: 500 }),
      ctxWith(),
    );

    expect(store.find("req-42")?.status).toBe(500);
  });

  test("votes to collect an ordinary request", () => {
    const consumer = debugHistoryConsumer(createDebugHistoryStore());
    expect(consumer.sample?.(ctxWith())).toBe(true);
  });

  test("excludes its own read endpoint from capture (no self-pollution)", () => {
    const consumer = debugHistoryConsumer(createDebugHistoryStore());
    const onList = ctxWith({
      request: new Request("https://cms.example/_plumix/debug/requests"),
    });
    const onDetail = ctxWith({
      request: new Request("https://cms.example/_plumix/debug/requests/req-1"),
    });

    expect(consumer.sample?.(onList)).toBe(false);
    expect(consumer.sample?.(onDetail)).toBe(false);
  });

  test("excludes the MCP endpoint — its telemetry tools are a second reader", () => {
    const consumer = debugHistoryConsumer(createDebugHistoryStore());
    const onMcp = ctxWith({
      request: new Request("https://cms.example/_plumix/mcp", {
        method: "POST",
      }),
    });

    expect(consumer.sample?.(onMcp)).toBe(false);
  });

  test("accounts for a base-path mount when excluding itself", () => {
    const consumer = debugHistoryConsumer(createDebugHistoryStore());
    const ctx = ctxWith({
      request: new Request("https://cms.example/cms/_plumix/debug/requests"),
      basePath: "/cms",
    });

    expect(consumer.sample?.(ctx)).toBe(false);
  });
});
