import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../plugin/manifest.js";
import type { DocumentManifest, DocumentMeta } from "../theme.js";
import { resolveEntryOgImage, seoHeadDefaults } from "./head-defaults.js";

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
    expect(byName(out, "twitter:card")?.content).toBe("summary");
  });

  test("og:image present upgrades the twitter card", () => {
    const out = seoHeadDefaults(
      {},
      { ...baseInputs, ogImage: "https://cms.example/og.png" },
    );
    expect(byProperty(out, "og:image")?.content).toBe(
      "https://cms.example/og.png",
    );
    expect(byName(out, "twitter:card")?.content).toBe("summary_large_image");
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
): MetaBoxField =>
  ({
    key,
    label: key,
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "media", scope: {} },
    ...(role ? { role } : {}),
  }) as MetaBoxField;

describe("resolveEntryOgImage", () => {
  test("returns the featured field's url", () => {
    const url = resolveEntryOgImage([mediaField("hero", "featured")], {
      hero: mediaRef("https://cdn/hero.jpg"),
    });
    expect(url).toBe("https://cdn/hero.jpg");
  });

  test("the ogImage-role override beats the featured field", () => {
    const url = resolveEntryOgImage(
      [mediaField("hero", "featured"), mediaField("share", "ogImage")],
      {
        hero: mediaRef("https://cdn/hero.jpg"),
        share: mediaRef("https://cdn/share.jpg"),
      },
    );
    expect(url).toBe("https://cdn/share.jpg");
  });

  test("field name is free — any tagged key resolves", () => {
    const url = resolveEntryOgImage([mediaField("coverPhoto", "featured")], {
      coverPhoto: mediaRef("https://cdn/cover.jpg"),
    });
    expect(url).toBe("https://cdn/cover.jpg");
  });

  test("an orphaned reference (null) falls through the chain", () => {
    const url = resolveEntryOgImage(
      [mediaField("share", "ogImage"), mediaField("hero", "featured")],
      { share: null, hero: mediaRef("https://cdn/hero.jpg") },
    );
    expect(url).toBe("https://cdn/hero.jpg");
  });

  test("falls through to the next field of the same role", () => {
    const url = resolveEntryOgImage(
      [mediaField("primary", "ogImage"), mediaField("fallback", "ogImage")],
      { primary: null, fallback: mediaRef("https://cdn/fallback.jpg") },
    );
    expect(url).toBe("https://cdn/fallback.jpg");
  });

  test("returns null when no role-tagged field has a value", () => {
    const url = resolveEntryOgImage([mediaField("hero", "featured")], {});
    expect(url).toBeNull();
  });

  test("returns null when no field carries a role", () => {
    const url = resolveEntryOgImage([mediaField("hero")], {
      hero: mediaRef("https://cdn/hero.jpg"),
    });
    expect(url).toBeNull();
  });

  test("a value without a usable url string is treated as absent", () => {
    const url = resolveEntryOgImage(
      [mediaField("share", "ogImage"), mediaField("hero", "featured")],
      { share: { id: "m1", url: "" }, hero: mediaRef("https://cdn/hero.jpg") },
    );
    expect(url).toBe("https://cdn/hero.jpg");
  });
});
