import { describe, expect, test } from "vitest";

import { createDebugCollector } from "./collector.js";

describe("createDebugCollector", () => {
  test("records entries per namespace and reads them back in order", () => {
    const debug = createDebugCollector(undefined);

    debug.record("blog", { label: "a" });
    debug.record("blog", { label: "b" });
    debug.record("media", { label: "c" });

    expect(debug.get("blog")).toEqual([{ label: "a" }, { label: "b" }]);
    expect(debug.get("media")).toEqual([{ label: "c" }]);
    expect(debug.get("empty")).toEqual([]);
  });

  test("is a no-op collector when the bar is disabled", () => {
    const debug = createDebugCollector(false);

    debug.record("blog", { label: "a" });

    expect(debug.get("blog")).toEqual([]);
  });

  test("drops records for a namespace in the disable denylist", () => {
    const debug = createDebugCollector({ disable: ["blog"] });

    debug.record("blog", { label: "a" });
    debug.record("media", { label: "b" });

    expect(debug.get("blog")).toEqual([]);
    expect(debug.get("media")).toEqual([{ label: "b" }]);
  });

  test("span returns the function result and records a named span", () => {
    const debug = createDebugCollector(undefined);

    const result = debug.span("db-query", () => 42);

    expect(result).toBe(42);
    const spans = debug.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("db-query");
    expect(spans[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("span awaits async work before timing it", async () => {
    const debug = createDebugCollector(undefined);

    const result = await debug.span("io", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "done";
    });

    expect(result).toBe("done");
    expect(debug.getSpans()[0]?.durationMs).toBeGreaterThanOrEqual(5);
  });

  test("nested spans form a parent/child tree", () => {
    const debug = createDebugCollector(undefined);

    debug.span("render", () => {
      debug.span("query-users", () => undefined);
      debug.span("query-posts", () => undefined);
    });
    debug.span("flush", () => undefined);

    const roots = debug.getSpans();
    expect(roots.map((s) => s.name)).toEqual(["render", "flush"]);
    expect(roots[0]?.children.map((s) => s.name)).toEqual([
      "query-users",
      "query-posts",
    ]);
  });
});
