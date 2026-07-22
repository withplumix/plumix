import { describe, expect, test } from "vitest";

import { createTelemetryCollector } from "./collector.js";

describe("createTelemetryCollector", () => {
  test("records timestamped entries per namespace and reads them back in order", () => {
    const telemetry = createTelemetryCollector(undefined);

    telemetry.record("blog", { label: "a" });
    telemetry.record("blog", { label: "b" });
    telemetry.record("media", { label: "c" });

    expect(telemetry.get("blog").map((r) => r.data)).toEqual([
      { label: "a" },
      { label: "b" },
    ]);
    expect(telemetry.get("blog").every((r) => typeof r.at === "number")).toBe(
      true,
    );
    expect(telemetry.get("media").map((r) => r.data)).toEqual([{ label: "c" }]);
    expect(telemetry.get("empty")).toEqual([]);
  });

  test("a thunk entry is evaluated once at record time", () => {
    const telemetry = createTelemetryCollector(undefined);
    let calls = 0;

    telemetry.record("blog", () => {
      calls += 1;
      return { label: "computed" };
    });

    expect(calls).toBe(1);
    expect(telemetry.get("blog").map((r) => r.data)).toEqual([
      { label: "computed" },
    ]);
  });

  test("a thunk entry for a denylisted namespace is never evaluated", () => {
    const telemetry = createTelemetryCollector({ disable: ["blog"] });
    let calls = 0;

    telemetry.record("blog", () => {
      calls += 1;
      return { label: "never" };
    });

    expect(calls).toBe(0);
    expect(telemetry.get("blog")).toEqual([]);
  });

  test("is a no-op collector when the bar is disabled", () => {
    const telemetry = createTelemetryCollector(false);

    telemetry.record("blog", { label: "a" });

    expect(telemetry.get("blog")).toEqual([]);
  });

  test("drops records for a namespace in the disable denylist", () => {
    const telemetry = createTelemetryCollector({ disable: ["blog"] });

    telemetry.record("blog", { label: "a" });
    telemetry.record("media", { label: "b" });

    expect(telemetry.get("blog")).toEqual([]);
    expect(telemetry.get("media").map((r) => r.data)).toEqual([{ label: "b" }]);
  });

  test("a span with a denylisted name is not collected and never evaluates attributes", () => {
    const telemetry = createTelemetryCollector({ disable: ["template"] });
    let calls = 0;

    const result = telemetry.span("template", (s) => {
      s.set("resolution", () => {
        calls += 1;
        return "never";
      });
      return 5;
    });

    expect(result).toBe(5);
    expect(telemetry.getSpans()).toEqual([]);
    expect(calls).toBe(0);
  });

  test("a thrown value whose serialization fails still propagates unchanged", () => {
    const telemetry = createTelemetryCollector(undefined);
    // No prototype → String(hostile) itself throws.
    const hostile: unknown = Object.create(null);
    let caught: unknown;

    try {
      telemetry.span("odd", () => {
        throw hostile;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(hostile);
    expect(telemetry.getSpans()[0]?.status).toBe("error");
  });

  test("getDropped returns a snapshot, not the live counters", () => {
    const telemetry = createTelemetryCollector(undefined);
    for (let i = 0; i < 1000; i++) telemetry.record("blog", { i });

    telemetry.record("blog", { over: 1 });
    const before = telemetry.getDropped();
    telemetry.record("blog", { over: 2 });

    expect(before.records).toEqual({ blog: 1 });
    expect(telemetry.getDropped().records).toEqual({ blog: 2 });
  });

  test("caps records per namespace, counts the dropped, and never evaluates dropped thunks", () => {
    const telemetry = createTelemetryCollector(undefined);
    for (let i = 0; i < 1000; i++) telemetry.record("blog", { i });
    let calls = 0;

    telemetry.record("blog", () => {
      calls += 1;
      return { i: 1000 };
    });
    telemetry.record("media", { fine: true });

    expect(telemetry.get("blog")).toHaveLength(1000);
    expect(calls).toBe(0);
    expect(telemetry.get("media")).toHaveLength(1);
    expect(telemetry.getDropped().records).toEqual({ blog: 1 });
  });

  test("caps spans per request, counts the dropped, and still runs their functions", () => {
    const telemetry = createTelemetryCollector(undefined);
    for (let i = 0; i < 2000; i++) telemetry.span(`s${i}`, () => undefined);
    let attrCalls = 0;

    const result = telemetry.span("over", (s) => {
      s.set("expensive", () => {
        attrCalls += 1;
        return "never";
      });
      return 42;
    });

    expect(result).toBe(42);
    expect(attrCalls).toBe(0);
    expect(telemetry.getSpans()).toHaveLength(2000);
    expect(telemetry.getDropped().spans).toBe(1);
  });

  test("dropped counters start at zero", () => {
    const telemetry = createTelemetryCollector(undefined);

    expect(telemetry.getDropped()).toEqual({ spans: 0, records: {} });
  });

  test("span returns the function result and records a named span", () => {
    const telemetry = createTelemetryCollector(undefined);

    const result = telemetry.span("db-query", () => 42);

    expect(result).toBe(42);
    const spans = telemetry.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("db-query");
    expect(spans[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("span passes a handle that sets attributes on the span", () => {
    const telemetry = createTelemetryCollector(undefined);

    telemetry.span("resolve", (s) => {
      s.set("template", "post");
      s.set("rules", 4);
    });

    expect(telemetry.getSpans()[0]?.attributes).toEqual({
      template: "post",
      rules: 4,
    });
  });

  test("span handle evaluates lazy attribute values exactly once", () => {
    const telemetry = createTelemetryCollector(undefined);
    let calls = 0;

    telemetry.span("resolve", (s) => {
      s.set("expensive", () => {
        calls += 1;
        return "computed";
      });
    });

    expect(calls).toBe(1);
    expect(telemetry.getSpans()[0]?.attributes).toEqual({
      expensive: "computed",
    });
  });

  test("span awaits async work before timing it", async () => {
    const telemetry = createTelemetryCollector(undefined);

    const result = await telemetry.span("io", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "done";
    });

    expect(result).toBe("done");
    expect(telemetry.getSpans()[0]?.durationMs).toBeGreaterThanOrEqual(5);
  });

  test("a successful span has ok status and no error", () => {
    const telemetry = createTelemetryCollector(undefined);

    telemetry.span("fine", () => 1);

    expect(telemetry.getSpans()[0]?.status).toBe("ok");
    expect(telemetry.getSpans()[0]?.error).toBeUndefined();
  });

  test("a throwing span is stamped error status + serialized error, then rethrows", () => {
    const telemetry = createTelemetryCollector(undefined);

    expect(() =>
      telemetry.span("boom", () => {
        throw new Error("kaboom");
      }),
    ).toThrow("kaboom");

    const span = telemetry.getSpans()[0];
    expect(span?.status).toBe("error");
    expect(span?.error?.name).toBe("Error");
    expect(span?.error?.message).toBe("kaboom");
    expect(span?.error?.stack).toBeDefined();
  });

  test("an async rejecting span is stamped error status and re-rejects", async () => {
    const telemetry = createTelemetryCollector(undefined);

    await expect(
      telemetry.span("io-boom", async () => {
        await new Promise((r) => setTimeout(r, 1));
        throw new Error("late kaboom");
      }),
    ).rejects.toThrow("late kaboom");

    const span = telemetry.getSpans()[0];
    expect(span?.status).toBe("error");
    expect(span?.error?.message).toBe("late kaboom");
    expect(span?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("a non-Error throw is serialized from its string form", () => {
    const telemetry = createTelemetryCollector(undefined);

    expect(() =>
      telemetry.span("odd", () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "plain string";
      }),
    ).toThrow();

    const span = telemetry.getSpans()[0];
    expect(span?.status).toBe("error");
    expect(span?.error?.message).toBe("plain string");
  });

  test("nested spans form a parent/child tree", () => {
    const telemetry = createTelemetryCollector(undefined);

    telemetry.span("render", () => {
      telemetry.span("query-users", () => undefined);
      telemetry.span("query-posts", () => undefined);
    });
    telemetry.span("flush", () => undefined);

    const roots = telemetry.getSpans();
    expect(roots.map((s) => s.name)).toEqual(["render", "flush"]);
    expect(roots[0]?.children.map((s) => s.name)).toEqual([
      "query-users",
      "query-posts",
    ]);
  });
});
