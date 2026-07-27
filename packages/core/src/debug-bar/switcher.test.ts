import { describe, expect, test } from "vitest";

import type { DebugHistoryEntry } from "./history.js";
import type { DebugSnapshot } from "./snapshot.js";
import { buildSwitcherEntries, switcherOptionLabel } from "./switcher.js";

function snapshotWith(
  overrides: Partial<DebugSnapshot["context"]> = {},
): DebugSnapshot {
  return {
    context: {
      method: "GET",
      path: "/blog/hello",
      origin: "https://cms.example",
      basePath: "",
      resolvedEntity: null,
      user: null,
      tokenScopes: null,
      siteName: null,
      locale: { code: "en", direction: "ltr" },
      slots: { cache: false, storage: false, mailer: false, images: false },
      plugins: { ids: [], entryTypes: [], termTaxonomies: [] },
      ...overrides,
    },
    spans: [],
    records: {},
  };
}

function entry(overrides: Partial<DebugHistoryEntry> = {}): DebugHistoryEntry {
  return {
    id: "req-1",
    startedAt: 1_000,
    status: 200,
    durationMs: 5,
    snapshot: snapshotWith(),
    ...overrides,
  };
}

describe("buildSwitcherEntries", () => {
  test("puts the current request first, flagged, then history newest-first", () => {
    const history = [
      entry({
        id: "b",
        snapshot: snapshotWith({ method: "POST", path: "/x" }),
      }),
      entry({ id: "a", status: 404 }),
    ];

    const entries = buildSwitcherEntries(
      { id: "current", method: "GET", path: "/now" },
      history,
    );

    expect(entries.map((e) => e.id)).toEqual(["current", "b", "a"]);
    // The in-flight request has no status/duration yet — the sole marker of it.
    expect(entries[0]).toEqual({
      id: "current",
      method: "GET",
      path: "/now",
      status: null,
      durationMs: null,
    });
    // Past entries carry their captured status/duration.
    expect(entries[1]).toMatchObject({
      id: "b",
      method: "POST",
      path: "/x",
      status: 200,
      durationMs: 5,
    });
  });

  test("dedupes the current request out of history so it appears only once", () => {
    const entries = buildSwitcherEntries(
      { id: "current", method: "GET", path: "/now" },
      [entry({ id: "current" }), entry({ id: "other" })],
    );

    expect(entries.map((e) => e.id)).toEqual(["current", "other"]);
    // Exactly one in-flight entry (status null); the history copy is dropped.
    expect(entries.filter((e) => e.status === null)).toHaveLength(1);
  });

  test("with no history the current request is the sole entry", () => {
    const entries = buildSwitcherEntries(
      { id: "current", method: "GET", path: "/now" },
      [],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBeNull();
  });
});

describe("switcherOptionLabel", () => {
  test("labels a captured request with method, path, status, and duration", () => {
    expect(
      switcherOptionLabel({
        id: "a",
        method: "POST",
        path: "/x",
        status: 500,
        durationMs: 9,
      }),
    ).toBe("POST /x · 500 · 9ms");
  });

  test("labels the in-flight current request without status/duration", () => {
    expect(
      switcherOptionLabel({
        id: "current",
        method: "GET",
        path: "/now",
        status: null,
        durationMs: null,
      }),
    ).toBe("GET /now · current");
  });
});
