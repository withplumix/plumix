import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { MetaBoxField, PluginRegistry } from "../plugin/manifest.js";
import type { DocumentManifest, DocumentMeta, TemplateData } from "../theme.js";
import { HookRegistry } from "../hooks/registry.js";
import {
  entryOgImage,
  resolveEntryOgImage,
  resolveOgImage,
  seoHeadDefaults,
} from "./head-defaults.js";

const baseInputs = {
  canonical: "https://cms.example/post/hello",
  title: "Hello",
  description: "An excerpt",
  ogType: "article" as const,
  ogImage: null,
  siteName: "Demo",
  ogLocale: "en",
  noindex: false,
  siteIsPrivate: false,
};

const meta = (m: DocumentManifest): readonly DocumentMeta[] => m.meta ?? [];
const byName = (m: DocumentManifest, name: string): DocumentMeta | undefined =>
  meta(m).find((entry) => entry.name === name);
const byProperty = (
  m: DocumentManifest,
  property: string,
): DocumentMeta | undefined =>
  meta(m).find((entry) => entry.property === property);

describe("seoHeadDefaults", () => {
  test("emits the full default meta set", () => {
    const out = seoHeadDefaults({}, baseInputs);
    expect(
      meta(out)
        .map((e) => e.name)
        .filter(Boolean),
    ).toEqual(
      expect.arrayContaining(["description", "robots", "twitter:card"]),
    );
    expect(
      meta(out)
        .map((e) => e.property)
        .filter(Boolean),
    ).toEqual(
      expect.arrayContaining([
        "og:title",
        "og:type",
        "og:url",
        "og:site_name",
        "og:description",
        "og:locale",
      ]),
    );
    expect(byProperty(out, "og:type")?.content).toBe("article");
    expect(byProperty(out, "og:url")?.content).toBe(baseInputs.canonical);
  });

  test("robots reflects index / search / private", () => {
    expect(byName(seoHeadDefaults({}, baseInputs), "robots")?.content).toBe(
      "index,follow,max-image-preview:large",
    );
    expect(
      byName(seoHeadDefaults({}, { ...baseInputs, noindex: true }), "robots")
        ?.content,
    ).toBe("noindex,follow");
    expect(
      byName(
        seoHeadDefaults({}, { ...baseInputs, siteIsPrivate: true }),
        "robots",
      )?.content,
    ).toBe("noindex,nofollow");
  });

  test("og:image omitted when none; summary card downgrades", () => {
    const out = seoHeadDefaults({}, baseInputs);
    expect(byProperty(out, "og:image")).toBeUndefined();
    expect(byName(out, "twitter:image")).toBeUndefined();
    expect(byName(out, "twitter:card")?.content).toBe("summary");
  });

  test("og:image present upgrades the twitter card", () => {
    const out = seoHeadDefaults(
      {},
      { ...baseInputs, ogImage: { url: "https://cms.example/og.png" } },
    );
    expect(byProperty(out, "og:image")?.content).toBe(
      "https://cms.example/og.png",
    );
    expect(byName(out, "twitter:card")?.content).toBe("summary_large_image");
    expect(byName(out, "twitter:image")?.content).toBe(
      "https://cms.example/og.png",
    );
    expect(byProperty(out, "og:image:width")).toBeUndefined();
    expect(byProperty(out, "og:image:height")).toBeUndefined();
  });

  test("a known size is reported alongside the image", () => {
    const out = seoHeadDefaults(
      {},
      {
        ...baseInputs,
        ogImage: {
          url: "https://cms.example/card.png",
          width: 1200,
          height: 630,
        },
      },
    );
    expect(byProperty(out, "og:image:width")?.content).toBe("1200");
    expect(byProperty(out, "og:image:height")?.content).toBe("630");
  });

  test("an image with no usable url emits no tag of the group", () => {
    const out = seoHeadDefaults(
      {},
      { ...baseInputs, ogImage: { url: "", width: 1200, height: 630 } },
    );

    expect(byProperty(out, "og:image:width")).toBeUndefined();
    expect(byProperty(out, "og:image:height")).toBeUndefined();
    expect(byName(out, "twitter:card")?.content).toBe("summary");
  });

  test("a template-set og:image keeps the whole image group to itself", () => {
    const out = seoHeadDefaults(
      {
        meta: [
          { property: "og:image", content: "https://cms.example/theme.png" },
        ],
      },
      {
        ...baseInputs,
        ogImage: {
          url: "https://cms.example/card.png",
          width: 1200,
          height: 630,
        },
      },
    );

    expect(meta(out).filter((e) => e.property === "og:image")).toHaveLength(1);
    expect(byProperty(out, "og:image")?.content).toBe(
      "https://cms.example/theme.png",
    );
    expect(byProperty(out, "og:image:width")).toBeUndefined();
    expect(byProperty(out, "og:image:height")).toBeUndefined();
    expect(byName(out, "twitter:image")).toBeUndefined();
  });

  test("description omitted when null", () => {
    const out = seoHeadDefaults({}, { ...baseInputs, description: null });
    expect(byName(out, "description")).toBeUndefined();
    expect(byProperty(out, "og:description")).toBeUndefined();
  });

  test("an already-set key is never duplicated", () => {
    const out = seoHeadDefaults(
      { meta: [{ name: "description", content: "theme" }] },
      baseInputs,
    );
    const descriptions = meta(out).filter((e) => e.name === "description");
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]?.content).toBe("theme");
  });
});

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

describe("resolveEntryOgImage", () => {
  test("returns the featured field's url", () => {
    const image = resolveEntryOgImage([mediaField("hero", "featured")], {
      hero: mediaRef("https://cdn/hero.jpg"),
    });
    expect(image?.url).toBe("https://cdn/hero.jpg");
  });

  test("carries the media row's measured size", () => {
    const image = resolveEntryOgImage([mediaField("hero", "featured")], {
      hero: { ...mediaRef("https://cdn/hero.jpg"), width: 1600, height: 900 },
    });
    expect(image).toEqual({
      url: "https://cdn/hero.jpg",
      width: 1600,
      height: 900,
    });
  });

  test("an unmeasured media row resolves to a url alone", () => {
    const image = resolveEntryOgImage([mediaField("hero", "featured")], {
      hero: { ...mediaRef("https://cdn/hero.jpg"), width: null, height: null },
    });
    expect(image).toEqual({ url: "https://cdn/hero.jpg" });
  });

  test("the ogImage-role override beats the featured field", () => {
    const image = resolveEntryOgImage(
      [mediaField("hero", "featured"), mediaField("share", "ogImage")],
      {
        hero: mediaRef("https://cdn/hero.jpg"),
        share: mediaRef("https://cdn/share.jpg"),
      },
    );
    expect(image?.url).toBe("https://cdn/share.jpg");
  });

  test("field name is free — any tagged key resolves", () => {
    const image = resolveEntryOgImage([mediaField("coverPhoto", "featured")], {
      coverPhoto: mediaRef("https://cdn/cover.jpg"),
    });
    expect(image?.url).toBe("https://cdn/cover.jpg");
  });

  test("an orphaned reference (null) falls through the chain", () => {
    const image = resolveEntryOgImage(
      [mediaField("share", "ogImage"), mediaField("hero", "featured")],
      { share: null, hero: mediaRef("https://cdn/hero.jpg") },
    );
    expect(image?.url).toBe("https://cdn/hero.jpg");
  });

  test("falls through to the next field of the same role", () => {
    const image = resolveEntryOgImage(
      [mediaField("primary", "ogImage"), mediaField("fallback", "ogImage")],
      { primary: null, fallback: mediaRef("https://cdn/fallback.jpg") },
    );
    expect(image?.url).toBe("https://cdn/fallback.jpg");
  });

  test("returns null when no role-tagged field has a value", () => {
    const image = resolveEntryOgImage([mediaField("hero", "featured")], {});
    expect(image).toBeNull();
  });

  test("returns null when no field carries a role", () => {
    const image = resolveEntryOgImage([mediaField("hero")], {
      hero: mediaRef("https://cdn/hero.jpg"),
    });
    expect(image).toBeNull();
  });

  test("a value without a usable url string is treated as absent", () => {
    const image = resolveEntryOgImage(
      [mediaField("share", "ogImage"), mediaField("hero", "featured")],
      { share: { id: "m1", url: "" }, hero: mediaRef("https://cdn/hero.jpg") },
    );
    expect(image?.url).toBe("https://cdn/hero.jpg");
  });
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

describe("entryOgImage", () => {
  test("resolves the entry's role-tagged image scoped to its type", () => {
    const registry = registryWith(["post"], [mediaField("hero", "featured")]);
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });
    expect(entryOgImage(registry, data)?.url).toBe("https://cdn/hero.jpg");
  });

  test("returns null when the entry type has no registered fields", () => {
    const registry = registryWith(["page"], [mediaField("hero", "featured")]);
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });
    expect(entryOgImage(registry, data)).toBeNull();
  });

  test("returns null for non-entry data", () => {
    const registry = registryWith(["post"], [mediaField("hero", "featured")]);
    const search = { kind: "search" } as unknown as TemplateData;
    expect(entryOgImage(registry, search)).toBeNull();
  });
});

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

  test("a role image outranks the filter, which never runs", async () => {
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
