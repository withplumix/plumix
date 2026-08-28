import type { DocumentManifest, DocumentMeta } from "plumix";
import { describe, expect, test } from "vitest";

import type { HeadInputs } from "./head.js";
import { seoHeadMeta } from "./head.js";

const baseInputs: HeadInputs = {
  canonical: "https://cms.example/post/hello",
  title: "Hello",
  description: "An excerpt",
  ogType: "article",
  ogImage: null,
  siteName: "Demo",
  ogLocale: "en",
  searchTitle: null,
  indexable: true,
  nofollow: false,
  published: null,
  modified: null,
  author: null,
};

const meta = (m: DocumentManifest): readonly DocumentMeta[] => m.meta ?? [];
const byName = (m: DocumentManifest, name: string): DocumentMeta | undefined =>
  meta(m).find((entry) => entry.name === name);
const byProperty = (
  m: DocumentManifest,
  property: string,
): DocumentMeta | undefined =>
  meta(m).find((entry) => entry.property === property);

describe("seoHeadMeta", () => {
  test("emits the full default meta set", () => {
    const out = seoHeadMeta({}, baseInputs);
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

  test("robots pairs the index answer with the follow one", () => {
    expect(byName(seoHeadMeta({}, baseInputs), "robots")?.content).toBe(
      "index,follow,max-image-preview:large",
    );
    expect(
      byName(seoHeadMeta({}, { ...baseInputs, indexable: false }), "robots")
        ?.content,
    ).toBe("noindex,follow");
    expect(
      byName(seoHeadMeta({}, { ...baseInputs, nofollow: true }), "robots")
        ?.content,
    ).toBe("index,nofollow,max-image-preview:large");
    expect(
      byName(
        seoHeadMeta({}, { ...baseInputs, indexable: false, nofollow: true }),
        "robots",
      )?.content,
    ).toBe("noindex,nofollow");
  });

  test("og:image omitted when none; summary card downgrades", () => {
    const out = seoHeadMeta({}, baseInputs);
    expect(byProperty(out, "og:image")).toBeUndefined();
    expect(byName(out, "twitter:image")).toBeUndefined();
    expect(byName(out, "twitter:card")?.content).toBe("summary");
  });

  test("og:image present upgrades the twitter card", () => {
    const out = seoHeadMeta(
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
    const out = seoHeadMeta(
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
    const out = seoHeadMeta(
      {},
      { ...baseInputs, ogImage: { url: "", width: 1200, height: 630 } },
    );

    expect(byProperty(out, "og:image:width")).toBeUndefined();
    expect(byProperty(out, "og:image:height")).toBeUndefined();
    expect(byName(out, "twitter:card")?.content).toBe("summary");
  });

  test("a template-set og:image keeps the whole image group to itself", () => {
    const out = seoHeadMeta(
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
    const out = seoHeadMeta({}, { ...baseInputs, description: null });
    expect(byName(out, "description")).toBeUndefined();
    expect(byProperty(out, "og:description")).toBeUndefined();
  });

  test("an already-set key is never duplicated", () => {
    const out = seoHeadMeta(
      { meta: [{ name: "description", content: "theme" }] },
      baseInputs,
    );
    const descriptions = meta(out).filter((e) => e.name === "description");
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]?.content).toBe("theme");
  });
});

describe("seoHeadMeta — article facts", () => {
  const article: HeadInputs = {
    ...baseInputs,
    published: new Date("2026-01-02T03:04:05.000Z"),
    modified: new Date("2026-02-03T04:05:06.000Z"),
    author: "Ada Lovelace",
  };

  test("an entry page carries its timestamps and byline", () => {
    const out = seoHeadMeta({}, article);

    expect(byProperty(out, "article:published_time")?.content).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    expect(byProperty(out, "article:modified_time")?.content).toBe(
      "2026-02-03T04:05:06.000Z",
    );
    expect(byProperty(out, "article:author")?.content).toBe("Ada Lovelace");
  });

  test("a website page carries none of them", () => {
    const out = seoHeadMeta({}, { ...article, ogType: "website" });

    expect(byProperty(out, "article:published_time")).toBeUndefined();
    expect(byProperty(out, "article:modified_time")).toBeUndefined();
    expect(byProperty(out, "article:author")).toBeUndefined();
  });

  test("an unpublished entry omits the timestamp rather than emitting an empty one", () => {
    const out = seoHeadMeta({}, { ...article, published: null });

    expect(byProperty(out, "article:published_time")).toBeUndefined();
    expect(byProperty(out, "article:modified_time")?.content).toBeTruthy();
  });

  test("a theme-set article tag wins", () => {
    const out = seoHeadMeta(
      { meta: [{ property: "article:author", content: "From Theme" }] },
      article,
    );

    expect(
      meta(out).filter((e) => e.property === "article:author"),
    ).toHaveLength(1);
    expect(byProperty(out, "article:author")?.content).toBe("From Theme");
  });
});

describe("seoHeadMeta gap-fills the document, not just the meta", () => {
  test("declares the canonical it was handed", () => {
    const out = seoHeadMeta({}, baseInputs);
    expect(out.link).toEqual([
      { rel: "canonical", href: baseInputs.canonical },
    ]);
  });

  test("a canonical already declared is left alone", () => {
    const existing = { rel: "canonical", href: "https://theme.example/x" };
    const out = seoHeadMeta({ link: [existing] }, baseInputs);
    expect(out.link).toEqual([existing]);
  });

  test("a search title becomes the document title and og:title", () => {
    const out = seoHeadMeta({}, { ...baseInputs, searchTitle: "For the SERP" });
    expect(out.title).toBe("For the SERP");
    expect(byProperty(out, "og:title")?.content).toBe("For the SERP");
  });

  test("no search title leaves the document title to core", () => {
    expect(seoHeadMeta({}, baseInputs).title).toBeUndefined();
  });

  test("a title already set outranks the search title", () => {
    expect(
      seoHeadMeta(
        { title: "From the template" },
        { ...baseInputs, searchTitle: "For the SERP" },
      ).title,
    ).toBe("From the template");
  });
});
