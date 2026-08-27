import type { ImageDelivery } from "plumix";
import { ACCESS_POLICY_META_KEY } from "plumix";
import { definePlugin } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import type { CardRule } from "./card.js";
import type { CardRenderer } from "./renderer.js";
import { card, cardKey } from "./index.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, headOf, ogImageOf, seedEntry } from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";
const PHOTO = "https://media.example/hero.jpg";

// The format a fresh install ships, and the only kind a card is advertised in.
const rasterRenderer = (): CardRenderer =>
  createFakeRenderer({ contentType: "image/png" }).renderer;

// A card that means to be the share image whatever else the entry carries.
const brandedCard: CardRule = card.fallback().define({
  mode: "card",
  key: ({ data }) => cardKey.of(data.kind),
  render: () => ({ type: "text", text: "branded" }),
});

// Options land in the path, so a test reads what was asked of the delivery.
// `zone: null` is the slot's one way of saying it cannot transform a source —
// `url` returns a string, so handing the source back is the whole vocabulary.
const testDelivery = (zone: string | null): ImageDelivery => ({
  kind: "test",
  url: (src, opts) =>
    zone === null
      ? src
      : `${zone}/${String(opts?.width)}x${String(opts?.height)},${String(opts?.fit)}/${src}`,
});

describe("the card in the page head", () => {
  test("advertises the card as the page's og:image, at the size it renders", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    const id = await seedEntry(harness, { slug: "hello-world" });

    const html = await headOf(harness, "hello-world");

    const url = `https://cms.example/_plumix/og/entry/${String(id)}.png`;
    expect(ogImageOf(html)).toBe(url);
    // The head names the URL by construction and the route answers on the path
    // core mounts it at. Nothing else holds those two together, and a drift
    // between them is a card that 404s on every scraper that follows it.
    const served = await harness.fetch(new URL(url).pathname);
    expect(served.assertStatus(200).headers.get("content-type")).toBe(
      "image/png",
    );
    // A scraper lays the preview out from the size before it fetches a byte,
    // and the wide card is what a 1200x630 render is for.
    expect(html).toContain('<meta property="og:image:width" content="1200"/>');
    expect(html).toContain('<meta property="og:image:height" content="630"/>');
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image"/>',
    );
    expect(html).not.toContain(SITE_DEFAULT);
  });

  test("leaves og:image to the site default when the renderer only makes SVG", async () => {
    const harness = await createHarness({ siteDefaultImage: SITE_DEFAULT });
    const id = await seedEntry(harness, { slug: "hello-world" });

    const html = await headOf(harness, "hello-world");
    const served = await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

    // An SVG og:image unfurls as nothing on X, Facebook and LinkedIn — worse
    // than the site's generic default. The route still serves it, so a
    // developer with no rasterizer can still look at their cards.
    expect(ogImageOf(html)).toBe(SITE_DEFAULT);
    expect(html).not.toContain("/_plumix/og/entry/");
    served.assertStatus(200);
  });

  test("reports the size a theme's own card declares, not the default", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      cards: [
        card.fallback().define({
          width: 1600,
          height: 900,
          key: ({ data }) => cardKey.of(data.kind),
          render: () => ({ type: "text", text: "wide" }),
        }),
      ],
    });
    await seedEntry(harness, { slug: "hello-world" });

    const html = await headOf(harness, "hello-world");

    // The head and the route have to agree on the card's size, or a scraper
    // lays out a box the bytes do not fill.
    expect(html).toContain('<meta property="og:image:width" content="1600"/>');
    expect(html).toContain('<meta property="og:image:height" content="900"/>');
  });

  test("advertises no card for an entry a scraper could not reach", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    await seedEntry(harness, { type: "gated", slug: "locked" });
    const member = await harness.seedUser("subscriber");

    // The page renders — for this visitor. The URL its head would advertise is
    // fetched by a scraper carrying no session, and the gate turns that away,
    // so the head must not name it however privileged the reader is.
    const response = await harness.dispatch(
      new Request("https://cms.example/gated/locked"),
      member,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_DEFAULT}"/>`,
    );
    expect(html).not.toContain("/_plumix/og/entry/");
  });

  test("advertises no card for an entry that gated itself", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    await seedEntry(harness, {
      type: "column",
      slug: "locked",
      meta: { [ACCESS_POLICY_META_KEY]: "members" },
    });
    const member = await harness.seedUser("subscriber");

    const response = await harness.dispatch(
      new Request("https://cms.example/column/locked"),
      member,
    );
    const html = await response.text();

    // The status matters: an empty body from a redirect would satisfy the
    // assertion below without the page ever having rendered.
    expect(response.status).toBe(200);
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_DEFAULT}"/>`,
    );
    expect(html).not.toContain("/_plumix/og/entry/");
  });

  test("advertises a card for an entry behind a soft gate", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    const id = await seedEntry(harness, { type: "teaser", slug: "preview" });

    const html = await (await harness.fetch("/teaser/preview")).text();

    // The teaser is a public document at the plain URL, so it unfurls — and the
    // route the head names answers the anonymous scraper that follows it.
    const url = `https://cms.example/_plumix/og/entry/${String(id)}.png`;
    expect(html).toContain(`<meta property="og:image" content="${url}"/>`);
    (await harness.fetch(new URL(url).pathname)).assertStatus(200);
  });

  test("advertises no card on a page the default template does not cover", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    await seedEntry(harness, { slug: "hello-world" });

    const html = await (await harness.fetch("/posts")).text();

    // Only entries have a default card; a term or archive page waits on a
    // theme-declared one.
    expect(ogImageOf(html)).toBe(SITE_DEFAULT);
    expect(html).not.toContain("/_plumix/og/entry/");
  });
});

describe("the og:image precedence chain", () => {
  test("an explicit share image outranks everything below it", async () => {
    const chosen = "https://media.example/chosen.png";
    const harness = await createHarness({
      renderer: rasterRenderer(),
      imageDelivery: testDelivery("https://img.example"),
      siteDefaultImage: SITE_DEFAULT,
      cards: [brandedCard],
    });
    await seedEntry(harness, {
      slug: "hello-world",
      shareImage: { url: chosen },
      featured: { url: PHOTO },
    });

    const html = await headOf(harness, "hello-world");

    // An author who picked a share image gets it — untouched, uncropped, and
    // not outranked by a card that declares itself the share image.
    expect(ogImageOf(html)).toBe(chosen);
  });

  test("a featured photo outranks the generated card", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
    });
    await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO, width: 1600, height: 1200 },
    });

    const html = await headOf(harness, "hello-world");

    // The author picked this photo for this entry; a generated card is the
    // answer for an entry that has no picture of its own.
    expect(ogImageOf(html)).toBe(PHOTO);
    expect(html).not.toContain("/_plumix/og/entry/");
  });

  test("crops the featured photo to the card's size", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      imageDelivery: testDelivery("https://img.example"),
    });
    await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO, width: 1600, height: 1200 },
    });

    const html = await headOf(harness, "hello-world");

    // A 4:3 photo unfurls letterboxed or badly cropped in the 1.91:1 slot.
    expect(ogImageOf(html)).toBe(`https://img.example/1200x630,cover/${PHOTO}`);
    expect(html).toContain('<meta property="og:image:width" content="1200"/>');
    expect(html).toContain('<meta property="og:image:height" content="630"/>');
  });

  test("crops to the size the theme's own card declares", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      imageDelivery: testDelivery("https://img.example"),
      cards: [
        card.fallback().define({
          width: 1600,
          height: 900,
          key: ({ data }) => cardKey.of(data.kind),
          render: () => ({ type: "text", text: "wide" }),
        }),
      ],
    });
    await seedEntry(harness, { slug: "hello-world", featured: { url: PHOTO } });

    const html = await headOf(harness, "hello-world");

    // The photo takes the shape of the card it stands in for, whatever that is.
    expect(ogImageOf(html)).toBe(`https://img.example/1600x900,cover/${PHOTO}`);
    expect(html).toContain('<meta property="og:image:width" content="1600"/>');
    expect(html).toContain('<meta property="og:image:height" content="900"/>');
  });

  test("with no image delivery the photo is emitted as it stands", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
    });
    await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO, width: 1600, height: 1200 },
    });

    const html = await headOf(harness, "hello-world");

    // Nothing can crop it, so it goes out at its own size rather than being
    // dropped or described as a crop that never happened. This is the whole
    // free-plan path: no rasterizer, no resizer, still a real preview.
    expect(ogImageOf(html)).toBe(PHOTO);
    expect(html).toContain('<meta property="og:image:width" content="1600"/>');
    expect(html).toContain('<meta property="og:image:height" content="1200"/>');
  });

  test("keeps the photo's own size when the delivery declines the crop", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      imageDelivery: testDelivery(null),
    });
    await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO, width: 1600, height: 1200 },
    });

    const html = await headOf(harness, "hello-world");

    // Advertising 1200x630 for bytes nobody cropped is the one lie a scraper
    // has no way to catch: it lays the preview out from the numbers.
    expect(ogImageOf(html)).toBe(PHOTO);
    expect(html).toContain('<meta property="og:image:width" content="1600"/>');
    expect(html).toContain('<meta property="og:image:height" content="1200"/>');
  });

  test("a card that declares itself the share image outranks the photo", async () => {
    const harness = await createHarness({
      renderer: rasterRenderer(),
      cards: [brandedCard],
    });
    const id = await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO, width: 1600, height: 1200 },
    });

    const html = await headOf(harness, "hello-world");

    // Branding is the whole point of the theme's card, so it is what every
    // share shows — photo or no photo.
    expect(ogImageOf(html)).toBe(
      `https://cms.example/_plumix/og/entry/${String(id)}.png`,
    );
  });

  test("a card declaring itself the share image still yields to an SVG-only renderer", async () => {
    const harness = await createHarness({ cards: [brandedCard] });
    await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO, width: 1600, height: 1200 },
    });

    const html = await headOf(harness, "hello-world");

    // There is no card a scraper would render, and the photo unfurls.
    expect(ogImageOf(html)).toBe(PHOTO);
  });

  test("stands aside for an image another plugin already resolved", async () => {
    const chosen = "https://cdn.example/hand-picked.png";
    const harness = await createHarness({
      renderer: rasterRenderer(),
      siteDefaultImage: SITE_DEFAULT,
      imageDelivery: testDelivery("https://img.example"),
      // Installed ahead of the card plugin, so its image is already on the
      // chain when the card's subscriber runs — the order that would let a
      // generated card overwrite one somebody meant.
      before: [
        definePlugin("test_share", {
          setup: (ctx) => {
            ctx.addFilter("seo:og_image", () => ({ url: chosen }));
          },
        }),
      ],
      // Declaring itself the share image still does not reach past another
      // contributor: `mode` speaks about the entry's own photo, which this
      // entry also has.
      cards: [brandedCard],
    });
    await seedEntry(harness, {
      slug: "hello-world",
      featured: { url: PHOTO },
    });

    const html = await headOf(harness, "hello-world");

    // Neither outranked nor fed through a transform meant for library media.
    expect(ogImageOf(html)).toBe(chosen);
    expect(html).not.toContain("/_plumix/og/entry/");
  });
});
