import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";
import { debugHistoryConsumer } from "./history-consumer.js";
import { createDebugHistoryStore } from "./history.js";

function ctxWith(overrides: Partial<AppContext> = {}): AppContext {
  return {
    request: new Request("https://cms.example/_plumix/rpc/entry/list", {
      method: "POST",
    }),
    origin: "https://cms.example",
    basePath: "",
    resolvedEntity: null,
    user: null,
    tokenScopes: null,
    locale: { code: "en", direction: "ltr" },
    plugins: {
      pluginIds: [],
      entryTypes: new Map(),
      termTaxonomies: new Map(),
    },
    ...overrides,
  } as unknown as AppContext;
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

  test("has no sample gate — it votes to collect every request", () => {
    expect(
      debugHistoryConsumer(createDebugHistoryStore()).sample,
    ).toBeUndefined();
  });
});
