import { ACCESS_POLICY_META_KEY } from "plumix";
import { definePlugin } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { card, cardKey } from "./index.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, seedEntry } from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";

// The format a fresh install ships, and the only kind a card is advertised in.
const RASTER = { contentType: "image/png" };

describe("the card in the page head", () => {
  test("advertises the card as the page's og:image, at the size it renders", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer(RASTER).renderer,
      siteDefaultImage: SITE_DEFAULT,
    });
    const id = await seedEntry(harness, { slug: "hello-world" });

    const html = await (await harness.fetch("/posts/hello-world")).text();

    const url = `https://cms.example/_plumix/og/entry/${String(id)}.png`;
    expect(html).toContain(`<meta property="og:image" content="${url}"/>`);
    // The head names the URL by construction and the route answers on the path
    // core mounts it at. Nothing else holds those two together, and a drift
    // between them is a card that 404s on every scraper that follows it.
    const card = await harness.fetch(new URL(url).pathname);
    expect(card.assertStatus(200).headers.get("content-type")).toBe(
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

    const html = await (await harness.fetch("/posts/hello-world")).text();
    const card = await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

    // An SVG og:image unfurls as nothing on X, Facebook and LinkedIn — worse
    // than the site's generic default. The route still serves it, so a
    // developer with no rasterizer can still look at their cards.
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_DEFAULT}"/>`,
    );
    expect(html).not.toContain("/_plumix/og/entry/");
    card.assertStatus(200);
  });

  test("stands aside for an image another plugin already resolved", async () => {
    const chosen = "https://cdn.example/hand-picked.png";
    const harness = await createHarness({
      renderer: createFakeRenderer(RASTER).renderer,
      siteDefaultImage: SITE_DEFAULT,
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
    });
    await seedEntry(harness, { slug: "hello-world" });

    const html = await (await harness.fetch("/posts/hello-world")).text();

    // A value already on the chain is another contributor's deliberate choice.
    // A generated card outranks the site's generic default, nothing more — and
    // never by an accident of `plugins: []` ordering.
    expect(html).toContain(`<meta property="og:image" content="${chosen}"/>`);
    expect(html).not.toContain("/_plumix/og/entry/");
  });

  test("reports the size a theme's own card declares, not the default", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer(RASTER).renderer,
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

    const html = await (await harness.fetch("/posts/hello-world")).text();

    // The head and the route have to agree on the card's size, or a scraper
    // lays out a box the bytes do not fill.
    expect(html).toContain('<meta property="og:image:width" content="1600"/>');
    expect(html).toContain('<meta property="og:image:height" content="900"/>');
  });

  test("advertises no card for an entry a scraper could not reach", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer(RASTER).renderer,
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
      renderer: createFakeRenderer(RASTER).renderer,
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
      renderer: createFakeRenderer(RASTER).renderer,
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
      renderer: createFakeRenderer(RASTER).renderer,
      siteDefaultImage: SITE_DEFAULT,
    });
    await seedEntry(harness, { slug: "hello-world" });

    const html = await (await harness.fetch("/posts")).text();

    // Only entries have a default card; a term or archive page waits on a
    // theme-declared one.
    expect(html).toContain(
      `<meta property="og:image" content="${SITE_DEFAULT}"/>`,
    );
    expect(html).not.toContain("/_plumix/og/entry/");
  });
});
