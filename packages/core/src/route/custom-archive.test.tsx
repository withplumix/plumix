import { describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import type {
  CustomArchiveData,
  ListingArchiveData,
} from "./render/resolved-entry.js";
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

// An archive that declares its entries and lets core list them: no resolver,
// no paginated route of its own, no hand-written pagination.
interface TalkArchiveData extends ListingArchiveData {
  readonly kind: "custom";
  readonly name: "talks";
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    talks: { data: TalkArchiveData };
  }
}

const talksPlugin = definePlugin("talks", (ctx) => {
  ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
  ctx.registerArchiveType("talks", {
    routes: ["/talks"],
    entries: (q) => q.ofTypes("talk").orderBy("title"),
    perPage: 2,
    title: "Talks",
  });
});

const talksTheme = defineTheme({
  templates: [
    forArchiveType("talks").template(({ data }) => (
      <main>
        <ul data-testid="talks">
          {data.entries.map((entry) => (
            <li key={entry.id}>{entry.title}</li>
          ))}
        </ul>
        <p data-testid="pages">{data.pagination.pageCount}</p>
      </main>
    )),
    fallback(() => null),
  ],
});

async function talksHarness(): Promise<DispatcherHarness> {
  const h = await createDispatcherHarness({
    plugins: [talksPlugin],
    theme: talksTheme,
  });
  const author = await h.seedUser("admin");
  for (const title of ["Alpha", "Bravo", "Charlie"]) {
    await h.factory.entry.create({
      type: "talk",
      title,
      status: "published",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      authorId: author.id,
    });
  }
  return h;
}

describe("an archive that declares its entries", () => {
  test("lists its first page under its own route", async () => {
    const h = await talksHarness();
    const body = await (
      await h.dispatch(new Request("https://cms.example/talks"))
    ).text();
    expect(body).toContain("Alpha");
    expect(body).toContain("Bravo");
    expect(body).not.toContain("Charlie");
    expect(body).toContain("<title>Talks</title>");
    // Three entries at two a page: core counted the pages, not the plugin.
    expect(body).toContain('data-testid="pages">2<');
  });

  test("serves its later pages at a route core derived", async () => {
    const h = await talksHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/talks/page/2"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Charlie");
    expect(body).not.toContain("Alpha");
  });

  test("404s the page after the last one", async () => {
    const h = await talksHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/talks/page/3"),
    );
    expect(response.status).toBe(404);
  });
});

// A second listed archive, this one with a subject to load: `resolve` gets the
// finished page and adds to it rather than building one.
interface RoomArchiveData extends ListingArchiveData {
  readonly kind: "custom";
  readonly name: "rooms";
  readonly room: string;
  readonly showing: number;
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    rooms: { data: RoomArchiveData };
  }
}

const roomsPlugin = definePlugin("rooms", (ctx) => {
  ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
  ctx.registerArchiveType("rooms", {
    routes: ["/rooms/:room"],
    entries: (q, params) =>
      params.room === "nowhere" ? null : q.ofTypes("talk"),
    resolve: (_ctx, params, listing) => {
      if (params.room === "closed") return null;
      return {
        data: {
          kind: "custom",
          name: "rooms",
          room: params.room ?? "",
          showing: listing.entries.length,
        },
        title: `Room ${params.room ?? ""}`,
      };
    },
  });
});

const roomsTheme = defineTheme({
  templates: [
    forArchiveType("rooms").template(({ data }) => (
      <main>
        <p data-testid="room">{data.room}</p>
        <p data-testid="showing">{data.showing}</p>
        <p data-testid="total">{data.pagination.total}</p>
      </main>
    )),
    fallback(() => null),
  ],
});

describe("a listed archive's resolver", () => {
  async function roomsHarness(): Promise<DispatcherHarness> {
    const h = await createDispatcherHarness({
      plugins: [roomsPlugin],
      theme: roomsTheme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "talk",
      status: "published",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      authorId: author.id,
    });
    return h;
  }

  test("receives the finished page and adds a title and data to it", async () => {
    const h = await roomsHarness();
    const body = await (
      await h.dispatch(new Request("https://cms.example/rooms/blue"))
    ).text();
    expect(body).toContain("<title>Room blue</title>");
    expect(body).toContain('data-testid="showing">1<');
    expect(body).toContain('data-testid="total">1<');
  });

  test("returning null is still a 404", async () => {
    const h = await roomsHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/rooms/closed"),
    );
    expect(response.status).toBe(404);
  });

  test("entries returning null 404s before the page is read", async () => {
    const h = await roomsHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/rooms/nowhere"),
    );
    expect(response.status).toBe(404);
  });

  test("a query nothing answers to 404s the page", async () => {
    // Distinct from `entries` declining the params: this one named a term,
    // and the term is what does not exist. Both are a 404 to a visitor.
    const lost = definePlugin("lost", (ctx) => {
      ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
      ctx.registerTermTaxonomy("track", { label: "Tracks" });
      ctx.registerArchiveType("lost-track", {
        routes: ["/tracks/:track"],
        entries: (q, params) => q.inTerm("track", params.track ?? ""),
        title: "Tracks",
      });
    });
    const h = await createDispatcherHarness({
      plugins: [lost],
      theme: roomsTheme,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/tracks/no-such-track"),
    );
    expect(response.status).toBe(404);
  });
});
