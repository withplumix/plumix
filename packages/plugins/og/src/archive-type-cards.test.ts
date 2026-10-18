import type {
  ArchiveTypeData,
  CdnStore,
  ConnectedCdn,
  ListingArchiveData,
} from "plumix";
import { anonymousPolicy, authenticatedPolicy } from "plumix/auth";
import { typeTag } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { memoryStorage } from "plumix/runtime";
import { pageNotFound } from "plumix/support";
import { describe, expect, test, vi } from "vitest";

import type { CardRenderer } from "./renderer.js";
import type { HarnessOptions } from "./test/harness.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import {
  createHarness,
  ogImageOf,
  seedEntry,
  seedTerm,
} from "./test/harness.js";

interface LocationData extends ArchiveTypeData {
  readonly place: string;
  readonly catalogue: string | null;
}

declare module "plumix" {
  interface ArchiveTypeRegistry {
    location: { data: LocationData };
    members: { data: LocationData };
    open: { data: LocationData };
    series: { data: ListingArchiveData };
  }
}

/** The places the directory has a page for; any other slug is a 404. */
const PLACES: Readonly<Record<string, string>> = {
  london: "London",
  leeds: "Leeds",
};

/**
 * A directory site's shape: one archive type answering at a location and at a
 * catalogue under it, resolved from its own route params.
 */
const directory = definePlugin("test_directory", (ctx) => {
  // Ahead of `location`, whose two-segment route would otherwise take it.
  ctx.registerArchiveType("members", {
    routes: ["/members/:location"],
    access: authenticatedPolicy,
    resolve: resolveLocation("members"),
  });
  ctx.registerArchiveType("series", {
    routes: ["/series/:name"],
    title: "Series",
    perPage: 1,
    entries: (q, params) =>
      q.ofTypes("post").inTerm("category", params.name ?? ""),
  });
  ctx.registerArchiveType("location", {
    routes: ["/:location", "/:location/:catalogue"],
    resolve: resolveLocation("location"),
  });
});

function resolveLocation(name: "location" | "members" | "open") {
  return (_ctx: unknown, params: Record<string, string>) => {
    if (params.location === "atlantis") throw pageNotFound();
    const place = PLACES[params.location ?? ""];
    if (place === undefined) return null;
    const data: LocationData = {
      kind: "archiveType",
      name,
      place,
      catalogue: params.catalogue ?? null,
    };
    return { data, title: place, tags: [`place:${params.location ?? ""}`] };
  };
}

const locationCard = card.forArchiveType("location").define({
  key: ({ data }) => cardKey.of("location", data.place, data.catalogue ?? ""),
  render: ({ data }) => ({
    type: "text",
    text: `${data.catalogue ?? "Courses"} in ${data.place}`,
  }),
});

/** The format scrapers render, and so the only one the head advertises. */
const rasterRenderer = (): CardRenderer =>
  createFakeRenderer({ contentType: "image/png" }).renderer;

const membersCard = card.forArchiveType("members").define({
  key: ({ data }) => cardKey.of("members", data.place),
  render: ({ data }) => ({ type: "text", text: `Members in ${data.place}` }),
});

const seriesCard = card.forArchiveType("series").define({
  key: ({ data }) => cardKey.of("series", data.pagination.total),
  render: ({ data }) => ({
    type: "text",
    text: `${String(data.pagination.total)} in the series`,
  }),
});

function directoryHarness(options: HarnessOptions = {}) {
  return createHarness({
    renderer: rasterRenderer(),
    before: [directory],
    cards: [locationCard, membersCard, seriesCard],
    ...options,
  });
}

/** An edge that keeps what it is handed, and the tags each entry went in under. */
function recordingCdn() {
  const put = vi.fn<CdnStore["put"]>(() => Promise.resolve());
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: { match: () => Promise.resolve(undefined), put },
    purgeTags: () => Promise.resolve(),
  };
  return { cdn, put };
}

/** The path of the card a page's head advertises. */
async function advertisedCard(
  harness: Awaited<ReturnType<typeof createHarness>>,
  page: string,
): Promise<string | undefined> {
  const html = await (await harness.fetch(page)).text();
  const url = ogImageOf(html);
  return url === undefined ? undefined : new URL(url).pathname;
}

describe("a plugin archive's card", () => {
  test("is advertised by the page's head and served by the card route", async () => {
    const harness = await directoryHarness();

    const path = await advertisedCard(harness, "/london");

    expect(path).toMatch(
      /^\/_plumix\/og\/card\/archive-type\/location\/location\/london\/[0-9a-f]{16}\.png$/,
    );
    const body = await (await harness.fetch(path ?? "")).text();
    expect(body).toContain("<text>Courses in London</text>");
  });

  test("gives each route's pages distinct, stable cards that all serve", async () => {
    const harness = await directoryHarness();

    const location = await advertisedCard(harness, "/leeds");
    const catalogue = await advertisedCard(harness, "/leeds/maths");

    expect(catalogue).toMatch(
      /^\/_plumix\/og\/card\/archive-type\/location\/catalogue\/maths\/location\/leeds\/[0-9a-f]{16}\.png$/,
    );
    expect(catalogue).not.toBe(location);
    expect(await advertisedCard(harness, "/leeds/maths")).toBe(catalogue);
    const locationBody = await (await harness.fetch(location ?? "")).text();
    const catalogueBody = await (await harness.fetch(catalogue ?? "")).text();
    expect(locationBody).toContain("<text>Courses in Leeds</text>");
    expect(catalogueBody).toContain("<text>maths in Leeds</text>");
  });

  test.each([
    ["returns null for", "york"],
    ["throws pageNotFound() for", "atlantis"],
  ])(
    "answers 404 and stores nothing for params the archive %s",
    async (_how, location) => {
      const fake = createFakeRenderer({ contentType: "image/png" });
      const storage = memoryStorage().connect({});
      const harness = await directoryHarness({
        renderer: fake.renderer,
        storage,
      });
      const named = `/_plumix/og/card/archive-type/location/location/${location}`;

      (await harness.fetch(`${named}.png`)).assertStatus(404);
      (await harness.fetch(`${named}/0123456789abcdef.png`)).assertStatus(404);

      expect(fake.inputs).toHaveLength(0);
      expect((await storage.list()).items).toHaveLength(0);
    },
  );

  test("is withheld from an archive whose policy refuses anonymous visitors", async () => {
    const harness = await directoryHarness();
    const member = await harness.seedUser("subscriber");

    // The page renders for a member, but a scraper is turned away from it.
    const page = await harness.fetch("/members/london", { as: member });
    const html = await page.assertStatus(200).text();

    expect(html).not.toContain("/_plumix/og/card/");
    (
      await harness.fetch(
        "/_plumix/og/card/archive-type/members/location/london.png",
      )
    ).assertStatus(404);
  });

  test("is advertised and served for an archive whose policy grants anonymous visitors", async () => {
    const open = definePlugin("test_open", (ctx) => {
      ctx.registerArchiveType("open", {
        routes: ["/open/:location"],
        access: anonymousPolicy,
        resolve: resolveLocation("open"),
      });
    });
    const openCard = card.forArchiveType("open").define({
      key: ({ data }) => cardKey.of("open", data.place),
      render: ({ data }) => ({ type: "text", text: `Open in ${data.place}` }),
    });
    const harness = await createHarness({
      renderer: rasterRenderer(),
      before: [open],
      cards: [openCard],
    });

    const path = await advertisedCard(harness, "/open/london");

    expect(path).toMatch(
      /^\/_plumix\/og\/card\/archive-type\/open\/location\/london\/[0-9a-f]{16}\.png$/,
    );
    const body = await (await harness.fetch(path ?? "")).text();
    expect(body).toContain("<text>Open in London</text>");
  });

  test("is shared by every page of a listing archive", async () => {
    const harness = await directoryHarness();
    const first = await seedEntry(harness, { slug: "one" });
    const second = await seedEntry(harness, { slug: "two" });
    await seedTerm(harness, { slug: "design", entryIds: [first, second] });

    const path = await advertisedCard(harness, "/series/design");

    expect(path).toMatch(
      /^\/_plumix\/og\/card\/archive-type\/series\/name\/design\/[0-9a-f]{16}\.png$/,
    );
    expect(await advertisedCard(harness, "/series/design/page/2")).toBe(path);
    const body = await (await harness.fetch(path ?? "")).text();
    expect(body).toContain("<text>2 in the series</text>");
  });

  test("has no second URL for a later page of a listing archive", async () => {
    const harness = await directoryHarness();
    const first = await seedEntry(harness, { slug: "one" });
    const second = await seedEntry(harness, { slug: "two" });
    await seedTerm(harness, { slug: "design", entryIds: [first, second] });
    const path = await advertisedCard(harness, "/series/design");
    const digest = path?.match(/([0-9a-f]{16})\.png$/)?.[1] ?? "";

    (
      await harness.fetch(
        `/_plumix/og/card/archive-type/series/name/design/page/2/${digest}.png`,
      )
    ).assertStatus(404);
  });

  test("is withheld from a listing archive that lists nothing", async () => {
    const harness = await directoryHarness();
    await seedTerm(harness, { slug: "empty" });

    (await harness.fetch("/series/empty")).assertStatus(200);
    expect(await advertisedCard(harness, "/series/empty")).toBeUndefined();
    (
      await harness.fetch("/_plumix/og/card/archive-type/series/name/empty.png")
    ).assertStatus(404);
  });

  test("moves to a new URL when an input the renderer reads changes", async () => {
    const before = await directoryHarness({ fonts: ["/fonts/A.ttf"] });
    const after = await directoryHarness({ fonts: ["/fonts/B.ttf"] });

    expect(await advertisedCard(after, "/london")).not.toBe(
      await advertisedCard(before, "/london"),
    );
  });

  test.each([
    ["the tags its resolver returns", "/london", "place:london"],
    [
      "core's tags for what a listing archive lists",
      "/series/design",
      typeTag("post"),
    ],
  ])("is stored at the edge under %s", async (_what, page, tag) => {
    const { cdn, put } = recordingCdn();
    const harness = await directoryHarness({ cdn });
    const entryId = await seedEntry(harness);
    await seedTerm(harness, { slug: "design", entryIds: [entryId] });
    const path = await advertisedCard(harness, page);
    put.mockClear();

    await harness.fetch(path ?? "");
    await harness.drainDeferred();

    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[2]).toContain(tag);
  });

  test.each([
    ["only the plugin's default card", []],
    [
      "a theme's own fallback card",
      [
        card.fallback().define({
          key: () => cardKey.of("anything"),
          render: () => ({ type: "text", text: "Anything" }),
        }),
      ],
    ],
  ])(
    "is not given to an archive no rule names, with %s",
    async (_with, cards) => {
      const harness = await directoryHarness({ cards });

      expect(await advertisedCard(harness, "/london")).toBeUndefined();
      (
        await harness.fetch(
          "/_plumix/og/card/archive-type/location/location/london.png",
        )
      ).assertStatus(404);
    },
  );
});
