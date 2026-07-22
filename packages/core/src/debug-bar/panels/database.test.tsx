import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import { createTelemetryCollector } from "../collector.js";
import { databasePanel } from "./database.js";

function ctxWithQueries(
  queries: readonly { sql: string; params: readonly unknown[] }[],
): AppContext {
  const telemetry = createTelemetryCollector(undefined);
  for (const q of queries) telemetry.record("database", q);
  return { telemetry } as unknown as AppContext;
}

describe("databasePanel", () => {
  test("renders recorded queries with kind, sql, params, and a count", () => {
    const ctx = ctxWithQueries([
      { sql: "select * from users where id = ?", params: [7] },
    ]);

    const html = renderToStaticMarkup(<>{databasePanel.render(ctx)}</>);

    expect(html).toContain("select");
    expect(html).toContain("users");
    expect(html).toContain("7");
    expect(html).toContain("1 query");
  });

  test("shows an empty state when no queries were recorded", () => {
    const html = renderToStaticMarkup(
      <>{databasePanel.render(ctxWithQueries([]))}</>,
    );

    expect(html).toContain("No queries");
  });
});
