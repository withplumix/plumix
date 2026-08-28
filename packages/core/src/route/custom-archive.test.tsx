import { describe, expect, test } from "vitest";

import type { CustomArchiveData } from "./render/resolved-entry.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { fallback, forArchiveType } from "./render/template-builders.js";

// A plugin's custom archive data, declared in the augmentable registry so
// `forArchiveType("event-series")` types `data.series`.
interface EventSeriesData extends CustomArchiveData {
  readonly kind: "custom";
  readonly name: "event-series";
  readonly series: string;
  // A field whose name collides with a built-in data sentinel (`"year" in data`
  // for date archives) — the SEO helpers must classify by `kind`, not by field.
  readonly year: number;
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    "event-series": { data: EventSeriesData };
  }
}

// A test plugin registering a whole archive type end-to-end — pattern and
// resolver — with no core changes.
const eventsPlugin = definePlugin("events", (ctx) => {
  ctx.registerArchiveType("event-series", {
    routes: ["/events/:series", "/events/:series/page/:page(\\d+)"],
    resolve: (_ctx, params) => {
      // Unknown series → 404 (the resolver owns its own not-found).
      if (params.series === "missing") return null;
      return {
        data: {
          kind: "custom",
          name: "event-series",
          series: params.series,
          year: 2026,
        },
        title: `Series: ${params.series}`,
      };
    },
  });
});

// A theme templating the custom archive via the targeted builder.
const eventsTheme = defineTheme({
  templates: [
    forArchiveType("event-series").template(({ data }) => (
      <main>
        <h1 data-testid="series">{data.series}</h1>
      </main>
    )),
    fallback(() => null),
  ],
});

describe("custom archive types (registerArchiveType)", () => {
  test("a plugin route dispatches to its resolver and templates the data", async () => {
    const h = await createDispatcherHarness({
      plugins: [eventsPlugin],
      theme: eventsTheme,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/events/summer"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    // `forArchiveType` matched and the typed `data.series` rendered.
    expect(body).toContain('data-testid="series"');
    expect(body).toContain("summer");
    // The resolver's title reached the document.
    expect(body).toContain("<title>Series: summer</title>");
  });

  test("a colliding data field name isn't mis-classified by the SEO helpers", async () => {
    // The payload carries a `year` field; the page must not be `noindex`-ed as
    // if it were a search page, nor pick up any other date-archive treatment.
    const h = await createDispatcherHarness({
      plugins: [eventsPlugin],
      theme: eventsTheme,
    });
    const body = await (
      await h.dispatch(new Request("https://cms.example/events/summer"))
    ).text();
    expect(body).not.toContain("/undefined/");
    expect(body).not.toContain('name="robots" content="noindex');
  });

  test("the resolver returning null is a 404", async () => {
    const h = await createDispatcherHarness({
      plugins: [eventsPlugin],
      theme: eventsTheme,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/events/missing"),
    );
    expect(response.status).toBe(404);
  });

  test("the paginated route dispatches with the page param", async () => {
    const h = await createDispatcherHarness({
      plugins: [eventsPlugin],
      theme: eventsTheme,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/events/summer/page/2"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("summer");
  });

  test("registering the same archive-type name twice throws", async () => {
    const dupePlugin = definePlugin("dupe", (ctx) => {
      ctx.registerArchiveType("event-series", {
        routes: ["/x/:y"],
        resolve: () => null,
      });
      ctx.registerArchiveType("event-series", {
        routes: ["/z/:w"],
        resolve: () => null,
      });
    });
    await expect(
      createDispatcherHarness({ plugins: [dupePlugin] }),
    ).rejects.toThrow();
  });
});
