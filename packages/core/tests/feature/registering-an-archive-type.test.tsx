import { describe, expect, test } from "vitest";

import type {
  ArchiveTypeData,
  ListingArchiveData,
} from "../../src/route/contract/resolved-entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  fallback,
  forArchiveType,
} from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

/**
 * A plugin's archive type data, declared in the augmentable registry so
 * `forArchiveType("event-series")` types `data.series`.
 */
interface EventSeriesData extends ArchiveTypeData {
  readonly kind: "archiveType";
  readonly name: "event-series";
  readonly series: string;
  /**
   * A field whose name collides with a built-in data sentinel (`"year" in data`
   * for date archives) — the SEO helpers must classify by `kind`, not by field.
   */
  readonly year: number;
}
declare module "../../src/template-registry.js" {
  interface ArchiveTypeRegistry {
    "event-series": { data: EventSeriesData };
  }
}

/**
 * A test plugin registering a whole archive type end-to-end — pattern and
 * resolver — with no core changes.
 */
const eventsPlugin = definePlugin("events", {
  setup: (ctx) => {
    ctx.registerArchiveType("event-series", {
      routes: ["/events/:series", "/events/:series/page/:page(\\d+)"],
      resolve: (_ctx, params) => {
        // Unknown series → 404 (the resolver owns its own not-found).
        if (params.series === "missing") return null;
        return {
          data: {
            kind: "archiveType",
            name: "event-series",
            series: params.series,
            year: 2026,
          },
          title: `Series: ${params.series}`,
        };
      },
    });
  },
});

/** A theme templating the archive type via the targeted builder. */
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

const eventsSite = await testSite({
  plugins: [eventsPlugin],
  config: { theme: eventsTheme },
});

describe("archive types (registerArchiveType)", () => {
  test("a plugin route dispatches to its resolver and templates the data", async () => {
    const page = await eventsSite.visit("/events/summer");

    page
      .assertOk()
      // `forArchiveType` matched and the typed `data.series` rendered.
      .assertSee('data-testid="series"')
      .assertSee("summer")
      // The resolver's title reached the document.
      .assertSee("<title>Series: summer</title>");
  });

  test("a colliding data field name isn't mis-classified by the SEO helpers", async () => {
    // The payload carries a `year` field; the page must not be `noindex`-ed as
    // if it were a search page, nor pick up any other date-archive treatment.
    const page = await eventsSite.visit("/events/summer");

    page
      .assertDontSee("/undefined/")
      .assertDontSee('name="robots" content="noindex');
  });

  test("the resolver returning null is a 404", async () => {
    const page = await eventsSite.visit("/events/missing");

    page.assertNotFound();
  });

  test("the paginated route dispatches with the page param", async () => {
    const page = await eventsSite.visit("/events/summer/page/2");

    page.assertOk().assertSee("summer");
  });

  test("registering the same archive-type name twice throws", async () => {
    const dupePlugin = definePlugin("dupe", {
      setup: (ctx) => {
        ctx.registerArchiveType("event-series", {
          routes: ["/x/:y"],
          resolve: () => null,
        });
        ctx.registerArchiveType("event-series", {
          routes: ["/z/:w"],
          resolve: () => null,
        });
      },
    });

    await expect(testSite({ plugins: [dupePlugin] })).rejects.toThrow(
      'Plugin "dupe" registers archive type "event-series", which it already registered.',
    );
  });
});

/**
 * An archive that declares its entries and lets core list them: no resolver,
 * no paginated route of its own, no hand-written pagination.
 */
interface TalkArchiveData extends ListingArchiveData {
  readonly kind: "archiveType";
  readonly name: "talks";
}
declare module "../../src/template-registry.js" {
  interface ArchiveTypeRegistry {
    talks: { data: TalkArchiveData };
  }
}

const talksPlugin = definePlugin("talks", {
  setup: (ctx) => {
    ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
    ctx.registerArchiveType("talks", {
      routes: ["/talks"],
      entries: (q) => q.ofTypes("talk").orderBy("title"),
      perPage: 2,
      title: "Talks",
    });
  },
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

const talksSite = await testSite({
  plugins: [talksPlugin],
  config: { theme: talksTheme },
});

/** Three talks, so two a page makes two pages. */
async function seedTalks(): Promise<void> {
  const publishedAt = new Date("2026-01-01T00:00:00Z");
  await talksSite.factory.published.create({
    type: "talk",
    title: "Alpha",
    publishedAt,
  });
  await talksSite.factory.published.create({
    type: "talk",
    title: "Bravo",
    publishedAt,
  });
  await talksSite.factory.published.create({
    type: "talk",
    title: "Charlie",
    publishedAt,
  });
}

describe("an archive that declares its entries", () => {
  test("lists its first page under its own route", async () => {
    await seedTalks();

    const page = await talksSite.visit("/talks");

    page
      .assertSee("Alpha")
      .assertSee("Bravo")
      .assertDontSee("Charlie")
      .assertSee("<title>Talks</title>")
      // Three entries at two a page: core counted the pages, not the plugin.
      .assertSee('data-testid="pages">2<');
  });

  test("serves its later pages at a route core derived", async () => {
    await seedTalks();

    const page = await talksSite.visit("/talks/page/2");

    page.assertOk().assertSee("Charlie").assertDontSee("Alpha");
  });

  test("404s the page after the last one", async () => {
    await seedTalks();

    const page = await talksSite.visit("/talks/page/3");

    page.assertNotFound();
  });
});

/**
 * A second listed archive, this one with a subject to load: `resolve` gets the
 * finished page and adds to it rather than building one.
 */
interface RoomArchiveData extends ListingArchiveData {
  readonly kind: "archiveType";
  readonly name: "rooms";
  readonly room: string;
  readonly showing: number;
}
declare module "../../src/template-registry.js" {
  interface ArchiveTypeRegistry {
    rooms: { data: RoomArchiveData };
  }
}

const roomsPlugin = definePlugin("rooms", {
  setup: (ctx) => {
    ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
    ctx.registerArchiveType("rooms", {
      routes: ["/rooms/:room"],
      entries: (q, params) =>
        params.room === "nowhere" ? null : q.ofTypes("talk"),
      resolve: (_ctx, params, listing) => {
        if (params.room === "closed") return null;
        return {
          data: {
            kind: "archiveType",
            name: "rooms",
            room: params.room ?? "",
            showing: listing.entries.length,
          },
          title: `Room ${params.room ?? ""}`,
        };
      },
    });
  },
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

const roomsSite = await testSite({
  plugins: [roomsPlugin],
  config: { theme: roomsTheme },
});

/**
 * Distinct from `entries` declining the params: this one named a term, and
 * the term is what does not exist. Both are a 404 to a visitor.
 */
const lost = definePlugin("lost", {
  setup: (ctx) => {
    ctx.registerEntryType("talk", { label: "Talks", isPublic: true });
    ctx.registerTermTaxonomy("track", { label: "Tracks" });
    ctx.registerArchiveType("lost-track", {
      routes: ["/tracks/:track"],
      entries: (q, params) => q.inTerm("track", params.track ?? ""),
      title: "Tracks",
    });
  },
});

const lostSite = await testSite({
  plugins: [lost],
  config: { theme: roomsTheme },
});

describe("a listed archive's resolver", () => {
  test("receives the finished page and adds a title and data to it", async () => {
    await roomsSite.factory.published.create({
      type: "talk",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const page = await roomsSite.visit("/rooms/blue");

    page
      .assertSee("<title>Room blue</title>")
      .assertSee('data-testid="showing">1<')
      .assertSee('data-testid="total">1<');
  });

  test("returning null is still a 404", async () => {
    await roomsSite.factory.published.create({
      type: "talk",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const page = await roomsSite.visit("/rooms/closed");

    page.assertNotFound();
  });

  test("entries returning null 404s before the page is read", async () => {
    await roomsSite.factory.published.create({
      type: "talk",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const page = await roomsSite.visit("/rooms/nowhere");

    page.assertNotFound();
  });

  test("a query nothing answers to 404s the page", async () => {
    const page = await lostSite.visit("/tracks/no-such-track");

    page.assertNotFound();
  });
});
