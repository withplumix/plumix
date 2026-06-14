import { describe, expect, test } from "vitest";

import type { DocumentManifest, DocumentMeta } from "../theme.js";
import { seoHeadDefaults } from "./head-defaults.js";

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
