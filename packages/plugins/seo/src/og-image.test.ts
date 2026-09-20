import type { TemplateData } from "plumix";
import type { AppContext, RoleImages } from "plumix/plugin";
import { HookRegistry } from "plumix/plugin";
import { createTestContext, createTestDb } from "plumix/test";
import { beforeAll, describe, expect, test } from "vitest";

import { resolveOgImage } from "./og-image.js";

// What core projects onto a resolved entry: the role images it resolved out of
// the page's own hydration batch. The chain reads the role off this, so a
// suite about the chain's *order* seeds the roles directly and leaves which
// field carries which role to core's own index.
const entryData = (images: RoleImages = {}): TemplateData =>
  ({
    kind: "entry",
    entry: { type: "post", images },
  }) as unknown as TemplateData;

const hero = { url: "https://cdn/hero.jpg", alt: null } as const;
// Described, so the `ogImage` arm carries the alt a media row filled in and
// not only the URL.
const share = { url: "https://cdn/share.jpg", alt: "A share card" } as const;

describe("resolveOgImage", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    db = await createTestDb();
  });

  // A real context, because the chain hands it on to `seo:og_image`
  // subscribers; the hooks are the only part of it the chain itself reads —
  // the roles arrive on the entry, so no registry is seeded here.
  const ogContext = (hooks: HookRegistry): AppContext =>
    createTestContext({ db, hooks });

  const siteDefault = "https://cms.example/default-og.png";

  test("a filter's image beats the site-wide default", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/card.png",
      width: 1200,
      height: 630,
    }));

    const image = await resolveOgImage(ogContext(hooks), entryData(), {
      override: null,
      siteDefault,
    });

    expect(image).toEqual({
      url: "https://cms.example/card.png",
      width: 1200,
      height: 630,
    });
  });

  test("a filter declining falls through to the site default", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (image) => image);

    const image = await resolveOgImage(ogContext(hooks), entryData(), {
      override: null,
      siteDefault,
    });

    expect(image).toEqual({ url: siteDefault });
  });

  test("the ogImage role outranks the filter, which never runs", async () => {
    const hooks = new HookRegistry();
    let ran = false;
    hooks.addFilter("seo:og_image", () => {
      ran = true;
      return { url: "https://cms.example/card.png" };
    });

    const image = await resolveOgImage(
      ogContext(hooks),
      entryData({ ogImage: share }),
      { override: null, siteDefault },
    );

    expect(image).toEqual(share);
    expect(ran).toBe(false);
  });

  test("a role the entry's scope declares but does not fill falls through", async () => {
    // `null` is how a declared role with no resolvable image reads — an
    // orphaned reference, or one the adapter refused — and it must not be
    // mistaken for an answer.
    const image = await resolveOgImage(
      ogContext(new HookRegistry()),
      entryData({ ogImage: null, featured: null }),
      { override: null, siteDefault },
    );

    expect(image).toEqual({ url: siteDefault });
  });

  test("the SEO box's own URL sits below the role and above the filter", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/card.png",
    }));

    const image = await resolveOgImage(ogContext(hooks), entryData(), {
      override: "https://cms.example/typed.png",
      siteDefault,
    });

    expect(image).toEqual({ url: "https://cms.example/typed.png" });
  });

  test("the featured photo beats the site default when no filter answers", async () => {
    const image = await resolveOgImage(
      ogContext(new HookRegistry()),
      entryData({ featured: hero }),
      { override: null, siteDefault },
    );

    expect(image).toEqual(hero);
  });

  test("declining leaves the featured photo exactly where it was", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (image) => image);

    const image = await resolveOgImage(
      ogContext(hooks),
      entryData({ featured: hero }),
      { override: null, siteDefault },
    );

    // The value handed in is null, so a subscriber that passes it through — or
    // returns null on a page it does not handle — costs the author nothing.
    // Anything else would make a bare `return null` guard delete featured
    // images site-wide.
    expect(image).toEqual(hero);
  });

  test("the featured photo is passed alongside, to improve on", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (_image, _data, _ctx, featured) =>
      featured ? { url: `${featured.url}?w=1200`, width: 1200 } : null,
    );

    const image = await resolveOgImage(
      ogContext(hooks),
      entryData({ featured: hero }),
      { override: null, siteDefault },
    );

    // Cropping the author's photo to a card's shape is the whole reason the
    // filter sees it — replacing it is not the only thing worth doing to it.
    expect(image).toEqual({ url: `${hero.url}?w=1200`, width: 1200 });
  });

  test("a filter may name what its own image shows", async () => {
    const photo = { url: "https://cdn/cat.jpg", alt: "A cat" } as const;
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (_image, _data, _ctx, featured) =>
      featured
        ? { url: `${featured.url}?w=1200`, alt: "The same cat, cropped" }
        : null,
    );

    const image = await resolveOgImage(
      ogContext(hooks),
      entryData({ featured: photo }),
      { override: null, siteDefault },
    );

    // The filter answered, so its alt describes the picture that goes out,
    // not the uncropped photo's.
    expect(image).toEqual({
      url: `${photo.url}?w=1200`,
      alt: "The same cat, cropped",
    });
  });

  test("an image a filter returns outranks the featured photo", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/card.png",
    }));

    const image = await resolveOgImage(
      ogContext(hooks),
      entryData({ featured: hero }),
      { override: null, siteDefault },
    );

    expect(image).toEqual({ url: "https://cms.example/card.png" });
  });

  test("the filter sees the page it is resolving", async () => {
    const hooks = new HookRegistry();
    const data = entryData();
    const seen: TemplateData[] = [];
    hooks.addFilter("seo:og_image", (image, page) => {
      seen.push(page);
      return image;
    });

    await resolveOgImage(ogContext(hooks), data, {
      override: null,
      siteDefault,
    });

    expect(seen).toEqual([data]);
  });

  test("a non-entry page carries no role image and reaches the filter", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/archive.png",
    }));
    const archive = { kind: "archive" } as unknown as TemplateData;

    const image = await resolveOgImage(ogContext(hooks), archive, {
      override: null,
      siteDefault,
    });

    expect(image).toEqual({ url: "https://cms.example/archive.png" });
  });

  test("with no role, no filter and no site default nothing resolves", async () => {
    const image = await resolveOgImage(
      ogContext(new HookRegistry()),
      entryData(),
      { override: null, siteDefault: null },
    );

    expect(image).toBeNull();
  });
});
