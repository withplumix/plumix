import type { PluginRegistry, TemplateData } from "plumix";
import type { AppContext, MetaBoxField } from "plumix/plugin";
import { HookRegistry } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { resolveOgImage } from "./og-image.js";

// A minimal hydrated media reference (the read shape the resolver consumes).
const mediaRef = (url: string) => ({ id: "m1", url });

const mediaField = (
  key: string,
  role?: "featured" | "ogImage",
): MetaBoxField => ({
  key,
  label: key,
  type: "json",
  inputType: "media",
  referenceTarget: { kind: "media", scope: {} },
  ...(role ? { role } : {}),
});

// A registry carrying one entry meta box, scoped to the given entry types.
const registryWith = (
  entryTypes: readonly string[],
  fields: readonly MetaBoxField[],
): PluginRegistry =>
  ({
    entryMetaBoxes: new Map([["box", { entryTypes, fields }]]),
  }) as unknown as PluginRegistry;

const entryData = (type: string, meta: Record<string, unknown>): TemplateData =>
  ({ kind: "entry", entry: { type, meta } }) as unknown as TemplateData;

// A context carrying just what the og:image chain reads: the entry-type field
// registry and the hook pipeline the filter runs through.
const ogContext = (plugins: PluginRegistry, hooks: HookRegistry): AppContext =>
  ({ plugins, hooks }) as unknown as AppContext;

describe("resolveOgImage", () => {
  const siteDefault = "https://cms.example/default-og.png";
  const noFields = registryWith([], []);
  const withFeatured = registryWith(["post"], [mediaField("hero", "featured")]);
  const withOverride = registryWith(["post"], [mediaField("share", "ogImage")]);

  test("a filter's image beats the site-wide default", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/card.png",
      width: 1200,
      height: 630,
    }));

    const image = await resolveOgImage(
      ogContext(noFields, hooks),
      entryData("post", {}),
      siteDefault,
    );

    expect(image).toEqual({
      url: "https://cms.example/card.png",
      width: 1200,
      height: 630,
    });
  });

  test("a filter declining falls through to the site default", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (image) => image);

    const image = await resolveOgImage(
      ogContext(noFields, hooks),
      entryData("post", {}),
      siteDefault,
    );

    expect(image).toEqual({ url: siteDefault });
  });

  test("an ogImage-role override outranks the filter, which never runs", async () => {
    const hooks = new HookRegistry();
    let ran = false;
    hooks.addFilter("seo:og_image", () => {
      ran = true;
      return { url: "https://cms.example/card.png" };
    });
    const data = entryData("post", {
      share: mediaRef("https://cdn/share.jpg"),
    });

    const image = await resolveOgImage(
      ogContext(withOverride, hooks),
      data,
      siteDefault,
    );

    expect(image).toEqual({ url: "https://cdn/share.jpg" });
    expect(ran).toBe(false);
  });

  test("a featured field registered for another type does not resolve", async () => {
    const registry = registryWith(["page"], [mediaField("hero", "featured")]);
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    const image = await resolveOgImage(
      ogContext(registry, new HookRegistry()),
      data,
      siteDefault,
    );

    // The role is read off the fields the entry's own type registered, so a
    // post cannot pick up a page's hero.
    expect(image).toEqual({ url: siteDefault });
  });

  test("the featured photo beats the site default when no filter answers", async () => {
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    const image = await resolveOgImage(
      ogContext(withFeatured, new HookRegistry()),
      data,
      siteDefault,
    );

    expect(image).toEqual({ url: "https://cdn/hero.jpg" });
  });

  test("declining leaves the featured photo exactly where it was", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (image) => image);
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    const image = await resolveOgImage(
      ogContext(withFeatured, hooks),
      data,
      siteDefault,
    );

    // The value handed in is null, so a subscriber that passes it through — or
    // returns null on a page it does not handle — costs the author nothing.
    // Anything else would make a bare `return null` guard delete featured
    // images site-wide.
    expect(image).toEqual({ url: "https://cdn/hero.jpg" });
  });

  test("the featured photo is passed alongside, to improve on", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", (_image, _data, _ctx, featured) =>
      featured ? { url: `${featured.url}?w=1200`, width: 1200 } : null,
    );
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    const image = await resolveOgImage(
      ogContext(withFeatured, hooks),
      data,
      siteDefault,
    );

    // Cropping the author's photo to a card's shape is the whole reason the
    // filter sees it — replacing it is not the only thing worth doing to it.
    expect(image).toEqual({ url: "https://cdn/hero.jpg?w=1200", width: 1200 });
  });

  test("an image a filter returns outranks the featured photo", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/card.png",
    }));
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    const image = await resolveOgImage(
      ogContext(withFeatured, hooks),
      data,
      siteDefault,
    );

    expect(image).toEqual({ url: "https://cms.example/card.png" });
  });

  test("the filter sees the page it is resolving", async () => {
    const hooks = new HookRegistry();
    const data = entryData("post", {});
    const seen: TemplateData[] = [];
    hooks.addFilter("seo:og_image", (image, page) => {
      seen.push(page);
      return image;
    });

    await resolveOgImage(ogContext(noFields, hooks), data, siteDefault);

    expect(seen).toEqual([data]);
  });

  test("a non-entry page reaches the filter too", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("seo:og_image", () => ({
      url: "https://cms.example/archive.png",
    }));
    const archive = { kind: "archive" } as unknown as TemplateData;

    const image = await resolveOgImage(
      ogContext(withFeatured, hooks),
      archive,
      siteDefault,
    );

    expect(image).toEqual({ url: "https://cms.example/archive.png" });
  });

  test("with no role, no filter and no site default nothing resolves", async () => {
    const image = await resolveOgImage(
      ogContext(noFields, new HookRegistry()),
      entryData("post", {}),
      null,
    );

    expect(image).toBeNull();
  });
});
