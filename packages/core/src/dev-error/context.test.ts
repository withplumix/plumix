import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { createTelemetryCollector } from "../context/collector.js";
import { collectDevErrorContext } from "./context.js";

function ctxWith(overrides: Partial<AppContext>): AppContext {
  return {
    request: new Request("https://cms.example/blog/hello?draft=1", {
      headers: { accept: "text/html", "user-agent": "vitest" },
    }),
    resolvedEntity: null,
    resolvedTemplate: null,
    origin: "https://cms.example",
    basePath: "",
    siteName: "Demo",
    locale: { code: "en", direction: "ltr" },
    cache: undefined,
    storage: undefined,
    mailer: undefined,
    imageDelivery: undefined,
    plugins: {
      pluginIds: ["core"],
      entryTypes: new Map([["post", {}]]),
      termTaxonomies: new Map([["category", {}]]),
    },
    telemetry: createTelemetryCollector(),
    ...overrides,
  } as unknown as AppContext;
}

describe("collectDevErrorContext", () => {
  test("captures the request method, full URL, and headers", () => {
    const context = collectDevErrorContext(ctxWith({}));

    expect(context.request.method).toBe("GET");
    expect(context.request.url).toBe("https://cms.example/blog/hello?draft=1");
    const header = context.request.headers.find(
      (h) => h.label === "user-agent",
    );
    expect(header?.value).toBe("vitest");
  });

  test("captures the resolved entity and template", () => {
    const context = collectDevErrorContext(
      ctxWith({
        resolvedEntity: { kind: "entry", id: 12 },
        resolvedTemplate: "post: hello",
      }),
    );

    expect(context.route.entity).toBe("entry #12");
    expect(context.route.template).toBe("post: hello");
  });

  test("describes an archive entity by its entry type", () => {
    const context = collectDevErrorContext(
      ctxWith({ resolvedEntity: { kind: "archive", entryType: "post" } }),
    );

    expect(context.route.entity).toBe("archive: post");
  });

  test("leaves the route empty when nothing resolved", () => {
    const context = collectDevErrorContext(ctxWith({}));

    expect(context.route.entity).toBeUndefined();
    expect(context.route.template).toBeUndefined();
  });

  test("collects executed queries with their timings", () => {
    const telemetry = createTelemetryCollector();
    telemetry.span("dispatch", () =>
      telemetry.span("db: select", (s) => {
        s.set("db.sql", "select * from entries");
      }),
    );
    const context = collectDevErrorContext(ctxWith({ telemetry }));

    expect(context.queries).toHaveLength(1);
    expect(context.queries[0]?.sql).toBe("select * from entries");
    expect(context.queries[0]?.durationMs).toBeTypeOf("number");
    expect(context.queries[0]?.failed).toBe(false);
  });

  test("flags the query whose span errored", () => {
    const telemetry = createTelemetryCollector();
    expect(() =>
      telemetry.span("dispatch", () =>
        telemetry.span("db: select", (s) => {
          s.set("db.sql", "select * from missing");
          throw new Error("no such table: missing");
        }),
      ),
    ).toThrow();
    const context = collectDevErrorContext(ctxWith({ telemetry }));

    const failing = context.queries.find((q) => q.sql.includes("missing"));
    expect(failing?.failed).toBe(true);
  });

  test("flattens a batch span into one query row per statement", () => {
    const telemetry = createTelemetryCollector();
    telemetry.span("db: batch", (s) => {
      s.set("db.batch", [
        { sql: "select * from posts", params: [] },
        { sql: "select * from terms", params: [] },
      ]);
    });
    const context = collectDevErrorContext(ctxWith({ telemetry }));

    expect(context.queries.map((q) => q.sql)).toEqual([
      "select * from posts",
      "select * from terms",
    ]);
    // A batch that succeeded flags nothing.
    expect(context.queries.every((q) => !q.failed && !q.batchFailed)).toBe(
      true,
    );
  });

  test("flags a failed batch as a group, not each statement individually", () => {
    const telemetry = createTelemetryCollector();
    // A batch is one atomic round-trip: the driver reports the whole sequence
    // failed, never which statement threw. So no row is `failed` on its own;
    // every row carries `batchFailed` instead.
    expect(() =>
      telemetry.span("db: batch", (s) => {
        s.set("db.batch", [
          { sql: "insert into posts values (1)", params: [] },
          { sql: "insert into posts values (1)", params: [] },
        ]);
        throw new Error("UNIQUE constraint failed: posts.id");
      }),
    ).toThrow();
    const context = collectDevErrorContext(ctxWith({ telemetry }));

    expect(context.queries).toHaveLength(2);
    for (const query of context.queries) {
      expect(query.failed).toBe(false);
      expect(query.batchFailed).toBe(true);
    }
  });

  test("builds a timeline row per span, flagging the failed one", () => {
    const telemetry = createTelemetryCollector();
    expect(() =>
      telemetry.span("dispatch", () =>
        telemetry.span("resolve", () => {
          throw new Error("boom");
        }),
      ),
    ).toThrow();
    const context = collectDevErrorContext(ctxWith({ telemetry }));

    const names = context.timeline.rows.map((r) => r.name);
    expect(names).toContain("dispatch");
    expect(names).toContain("resolve");
    const resolve = context.timeline.rows.find((r) => r.name === "resolve");
    expect(resolve?.failed).toBe(true);
    expect(resolve?.depth).toBe(1);
  });

  test("returns empty queries and timeline when nothing was collected", () => {
    const context = collectDevErrorContext(ctxWith({}));

    expect(context.queries).toEqual([]);
    expect(context.timeline.rows).toEqual([]);
  });

  test("captures app facts — site, origin, locale, slots, plugins, types", () => {
    const context = collectDevErrorContext(ctxWith({}));

    const facts = new Map(context.app.map((f) => [f.label, f.value]));
    expect(facts.get("Site name")).toBe("Demo");
    expect(facts.get("Origin")).toBe("https://cms.example");
    expect(facts.get("Locale")).toContain("en");
    expect(facts.get("Entry types")).toContain("post");
  });
});
