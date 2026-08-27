import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { CardRenderer } from "../renderer.js";
import { createFakeRenderer } from "../test/fake-renderer.js";
import {
  createHarness,
  DEV_ORIGIN,
  ogImageOf,
  seedEntry,
} from "../test/harness.js";

const PANEL = 'data-testid="plumix-debug-panel-og"';
const PHOTO = "https://media.example/hero.jpg";

const original = process.env.PLUMIX_DEV;

beforeEach(() => {
  process.env.PLUMIX_DEV = "1";
});

afterEach(() => {
  if (original === undefined) delete process.env.PLUMIX_DEV;
  else process.env.PLUMIX_DEV = original;
});

// The format a fresh install ships, and the only kind a card is advertised in.
const rasterRenderer = (): CardRenderer =>
  createFakeRenderer({ contentType: "image/png" }).renderer;

describe("the og:image debug panel", () => {
  test("names the generated card, and the rule that produced it", async () => {
    const harness = await createHarness({ renderer: rasterRenderer() });
    await seedEntry(harness, { slug: "hello-world" });

    const html = await harness
      .fetch(`${DEV_ORIGIN}/posts/hello-world`)
      .then((r) => r.text());

    expect(html).toContain(PANEL);
    expect(html).toContain("Generated card");
    expect(html).toContain("fallback");
    // The card's URL carries its digest, so the panel is asserted against the
    // one the head published rather than against a URL spelled by hand.
    const advertised = ogImageOf(html);
    expect(advertised).toMatch(
      /\/_plumix\/og\/card\/entry\/\d+\/[0-9a-f]+\.png$/,
    );
    expect(html).toContain(String(advertised));
  });

  test("names the entry's featured photo where that is what won", async () => {
    const harness = await createHarness({ renderer: rasterRenderer() });
    await seedEntry(harness, { slug: "with-photo", featured: { url: PHOTO } });

    const html = await harness
      .fetch(`${DEV_ORIGIN}/posts/with-photo`)
      .then((r) => r.text());

    expect(html).toContain("Featured photo");
    expect(html).toContain(PHOTO);
  });

  test("says a format scrapers cannot read is why no card is advertised", async () => {
    // SVG by default: the route serves it, but no scraper renders it, so the
    // head keeps the site-wide default and nothing else says why.
    const harness = await createHarness({});
    await seedEntry(harness, { slug: "svg-card" });

    const html = await harness
      .fetch(`${DEV_ORIGIN}/posts/svg-card`)
      .then((r) => r.text());

    expect(html).toContain("format is not scraper-safe");
    expect(html).toContain("Site default");
  });

  test("tells that reason apart from an entry no scraper may read", async () => {
    const harness = await createHarness({ renderer: rasterRenderer() });
    await seedEntry(harness, { slug: "locked", type: "gated" });
    const member = await harness.seedUser("subscriber");

    // The page renders for this reader; the card URL it would name is fetched
    // by an anonymous scraper the gate turns away. Without the panel the only
    // symptom is a head that quietly kept the site-wide default.
    const response = await harness.dispatch(
      new Request(`${DEV_ORIGIN}/gated/locked`),
      member,
    );
    const html = await response.text();

    expect(html).toContain("a private or access-gated");
    expect(html).not.toContain("format is not scraper-safe");
  });

  test("names the explicit og:image role, which the filter never sees", async () => {
    const harness = await createHarness({ renderer: rasterRenderer() });
    await seedEntry(harness, {
      slug: "explicit",
      shareImage: { url: "https://media.example/chosen.png" },
    });

    const html = await harness
      .fetch(`${DEV_ORIGIN}/posts/explicit`)
      .then((r) => r.text());

    expect(html).toContain("Explicit og:image role");
  });
});
