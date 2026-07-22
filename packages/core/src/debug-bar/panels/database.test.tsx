import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { TelemetryCollector } from "../../context/telemetry.js";
import { createTelemetryCollector } from "../../context/collector.js";
import { databasePanel } from "./database.js";

function ctxWith(seed: (telemetry: TelemetryCollector) => void): AppContext {
  const telemetry = createTelemetryCollector();
  seed(telemetry);
  return { telemetry } as unknown as AppContext;
}

describe("databasePanel", () => {
  test("renders query spans with kind, sql, params, duration, and a count", () => {
    // Nested under a phase span, as real query spans are under dispatch.
    const ctx = ctxWith((telemetry) =>
      telemetry.span("dispatch", () =>
        telemetry.span("db: select", (s) => {
          s.set("db.sql", "select * from users where id = ?");
          s.set("db.params", [7]);
          s.set("db.rows", 1);
        }),
      ),
    );

    const html = renderToStaticMarkup(<>{databasePanel.render(ctx)}</>);

    expect(html).toContain("select");
    expect(html).toContain("users");
    expect(html).toContain("7");
    expect(html).toContain("1 query");
    expect(html).toContain("ms");
  });

  test("flattens a batch span into its statements", () => {
    const ctx = ctxWith((telemetry) =>
      telemetry.span("db: select (2)", (s) => {
        s.set("db.batch", [
          { sql: "select * from posts", params: [] },
          { sql: "select * from terms where id = ?", params: [3] },
        ]);
        s.set("db.rows", 5);
      }),
    );

    const html = renderToStaticMarkup(<>{databasePanel.render(ctx)}</>);

    expect(html).toContain("2 queries");
    expect(html).toContain("posts");
    expect(html).toContain("terms");
  });

  test("ignores non-query spans and shows an empty state", () => {
    const ctx = ctxWith((telemetry) =>
      telemetry.span("dispatch", () => undefined),
    );

    const html = renderToStaticMarkup(<>{databasePanel.render(ctx)}</>);

    expect(html).toContain("No queries");
  });
});
