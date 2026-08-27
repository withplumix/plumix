import { describe, expect, test } from "vitest";

import type { CardTarget } from "./card-target.js";
import type { CardRenderer } from "./renderer.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import {
  cardPath,
  createHarness,
  fetchCard,
  ogImageOf,
  seedEntry,
  seedTerm,
} from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";

// The format a fresh install ships, and the only kind a card is advertised in.
const rasterRenderer = (): CardRenderer =>
  createFakeRenderer({ contentType: "image/png" }).renderer;

/** Dated, so the date archive a seeded post lands in is known. */
const PUBLISHED_AT = "2026-03-04T00:00:00.000Z";

describe("the default card past entries", () => {
  test("serves a term archive's card with no theme configuration", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const entryId = await seedEntry(harness);
    const termId = await seedTerm(harness, {
      name: "Design",
      entryIds: [entryId],
    });

    const response = await fetchCard(harness, { kind: "term", id: termId });

    const body = await response.assertStatus(200).text();
    expect(body).toContain("Design");
    expect(body).toContain("Example Site");
  });

  test("serves a content-type archive's card under its plural label", async () => {
    const harness = await createHarness();
    await seedEntry(harness);

    const response = await fetchCard(harness, {
      kind: "archive",
      entryType: "post",
    });

    expect(await response.assertStatus(200).text()).toContain("Posts");
  });

  test("serves an author archive's card under the author's name", async () => {
    const harness = await createHarness();
    const author = await harness.factory.user.create({ name: "Ada Lovelace" });
    await seedEntry(harness, { authorId: author.id });

    const response = await fetchCard(harness, {
      kind: "author",
      id: author.id,
    });

    expect(await response.assertStatus(200).text()).toContain("Ada Lovelace");
  });

  test("serves a date archive's card at the granularity the URL names", async () => {
    const harness = await createHarness();
    await seedEntry(harness, { publishedAt: new Date(PUBLISHED_AT) });

    const response = await fetchCard(harness, {
      kind: "date",
      year: 2026,
      month: 3,
      day: null,
    });

    expect(await response.assertStatus(200).text()).toContain("2026-03");
  });

  test("serves the front page's card as the site over its tagline", async () => {
    const harness = await createHarness();
    await harness.factory.setting.create({
      group: "site",
      key: "tagline",
      value: "Words about things",
    });

    const response = await fetchCard(harness, { kind: "front-page" });

    const body = await response.assertStatus(200).text();
    expect(body).toContain("Example Site");
    expect(body).toContain("Words about things");
  });

  test("gives two archives of one site two cards", async () => {
    const harness = await createHarness();
    const entryId = await seedEntry(harness);
    const first = await seedTerm(harness, {
      name: "Design",
      slug: "design",
      entryIds: [entryId],
    });
    const second = await seedTerm(harness, {
      name: "Design",
      slug: "design-too",
      entryIds: [entryId],
    });

    expect(await cardPath(harness, { kind: "term", id: first })).not.toBe(
      await cardPath(harness, { kind: "term", id: second }),
    );
  });
});

describe("which pages are shareable", () => {
  const refused: readonly (readonly [string, CardTarget])[] = [
    ["a term nothing is filed under", { kind: "term", id: 1 }],
    [
      "an archive with nothing published",
      { kind: "archive", entryType: "post" },
    ],
    ["an author who has published nothing", { kind: "author", id: 1 }],
    [
      "a date range with nothing in it",
      { kind: "date", year: 2011, month: null, day: null },
    ],
  ];

  test.each(refused)("answers 404 for %s", async (_name, target) => {
    const harness = await createHarness();
    await seedTerm(harness, { name: "Empty", slug: "empty" });

    (await fetchCard(harness, target)).assertStatus(404);
  });

  test("answers 404 for an archive its own access policy gates", async () => {
    const harness = await createHarness();
    await seedEntry(harness, { type: "memo", slug: "budget" });

    // The listing page itself sends an anonymous visitor to sign in, so the
    // card — public, immutable and shared-cached — must not answer for it.
    (await harness.fetch("/memo")).assertStatus(302);
    (
      await fetchCard(harness, { kind: "archive", entryType: "memo" })
    ).assertStatus(404);
  });

  test("answers 404 for a term in a taxonomy with no public archive", async () => {
    const harness = await createHarness();
    const entryId = await seedEntry(harness);
    const termId = await seedTerm(harness, {
      taxonomy: "mood",
      name: "Wistful",
      slug: "wistful",
      entryIds: [entryId],
    });

    (await fetchCard(harness, { kind: "term", id: termId })).assertStatus(404);
  });

  test("answers 404 for an entry type registered without an archive", async () => {
    const harness = await createHarness();
    await seedEntry(harness, { type: "column", slug: "col" });

    (
      await fetchCard(harness, { kind: "archive", entryType: "column" })
    ).assertStatus(404);
  });

  test("answers 404 for a date that does not exist", async () => {
    const harness = await createHarness();
    await seedEntry(harness);

    (await harness.fetch("/_plumix/og/card/date/2026-13.svg")).assertStatus(
      404,
    );
  });

  test("serves the front page's card on a site with nothing published", async () => {
    const harness = await createHarness();

    (await fetchCard(harness, { kind: "front-page" })).assertStatus(200);
  });

  test("has no card URL for a search page", async () => {
    const harness = await createHarness();
    await seedEntry(harness);

    (await harness.fetch("/_plumix/og/card/search/cats.svg")).assertStatus(404);
  });
});

describe("a theme's own card past entries", () => {
  test("outranks the default on the page kind it declares", async () => {
    const harness = await createHarness({
      cards: [
        card.taxonomy().define({
          key: ({ data }) => cardKey.of("term", data.term.id, data.term.name),
          render: ({ data }) => ({
            type: "text",
            text: `Filed under ${data.term.name}`,
          }),
        }),
      ],
    });
    const entryId = await seedEntry(harness);
    const termId = await seedTerm(harness, {
      name: "Design",
      entryIds: [entryId],
    });

    const body = await (
      await fetchCard(harness, { kind: "term", id: termId })
    ).text();

    expect(body).toContain("Filed under Design");
  });
});

describe("the card in a listing page's head", () => {
  test("advertises the card the route serves for a term archive", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    const entryId = await seedEntry(harness);
    await seedTerm(harness, { name: "Design", entryIds: [entryId] });

    const html = await (await harness.fetch("/category/design")).text();

    const url = ogImageOf(html) ?? "";
    expect(url).toMatch(/\/_plumix\/og\/card\/term\/\d+\/[0-9a-f]+\.png$/);
    (await harness.fetch(new URL(url).pathname)).assertStatus(200);
  });

  test("advertises the same card from page two of a listing", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
      // Keyed on what the page lists, which is the only kind of card that can
      // tell the two slices apart — and the kind `card.archive()` invites.
      cards: [
        card.archive().define({
          key: ({ data }) =>
            cardKey.of("posts", ...data.entries.map((entry) => entry.id)),
          render: ({ data }) => ({
            type: "text",
            text: `${String(data.pagination.total)} posts`,
          }),
        }),
      ],
    });
    for (let i = 0; i < 25; i++) {
      await seedEntry(harness, {
        title: `Post ${String(i)}`,
        slug: `p${String(i)}`,
      });
    }

    const [first, second] = await Promise.all([
      harness.fetch("/posts").then((r) => r.text()),
      harness.fetch("/posts/page/2").then((r) => r.text()),
    ]);

    // A card names the archive, not one slice of it — and the route only ever
    // renders the first page, so a head that digested page two's entries would
    // publish a URL every scraper is redirected away from.
    expect(ogImageOf(second)).toBe(ogImageOf(first));
    (
      await harness.fetch(new URL(ogImageOf(second) ?? "").pathname)
    ).assertStatus(200);
  });

  test("falls back to the site default on an archive that lists nothing", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    await seedTerm(harness, { name: "Empty", slug: "empty" });

    const html = await (await harness.fetch("/category/empty")).text();

    expect(ogImageOf(html)).toBe(SITE_DEFAULT);
  });
});
