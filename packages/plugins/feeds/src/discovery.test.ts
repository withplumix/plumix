import type { AppContext, DocumentManifest, TemplateData } from "plumix";
import { describe, expect, test } from "vitest";

import { applyFeedDiscovery } from "./discovery.js";

describe("applyFeedDiscovery", () => {
  const ctx = {
    origin: "https://cms.example",
    basePath: "",
    plugins: {
      entryTypes: new Map([["post", { name: "post", isPublic: true }]]),
      termTaxonomies: new Map([
        ["category", { name: "category", isPublic: true }],
        ["region", { name: "region", isPublic: true, isHierarchical: true }],
      ]),
    },
  } as unknown as AppContext;
  const empty: DocumentManifest = {};
  const alternates = (m: DocumentManifest): readonly string[] =>
    (m.link ?? [])
      .filter((l) => l.rel === "alternate")
      .map((l) => `${String(l.type)} ${String(l.href)}`);
  const discover = (
    data: TemplateData,
    override: Partial<AppContext> = {},
    siteIsPrivate = false,
  ): DocumentManifest =>
    applyFeedDiscovery(empty, data, { ...ctx, ...override }, siteIsPrivate);

  const frontPage = {
    kind: "frontPage",
    entries: [],
    pagination: { page: 1, perPage: 10, total: 0, pageCount: 0 },
  } as unknown as TemplateData;

  test("front-page data advertises the site feed (RSS + Atom)", () => {
    expect(alternates(discover(frontPage))).toEqual([
      "application/rss+xml https://cms.example/feed",
      "application/atom+xml https://cms.example/feed/atom",
    ]);
  });

  test("discovery links carry the configured basePath", () => {
    expect(
      alternates(discover(frontPage, { basePath: "/custom-directory" })),
    ).toEqual([
      "application/rss+xml https://cms.example/custom-directory/feed",
      "application/atom+xml https://cms.example/custom-directory/feed/atom",
    ]);
  });

  test("archive data advertises the type feed", () => {
    const data = {
      kind: "archive",
      contentType: "post",
      entries: [],
      pagination: { page: 1, perPage: 10, total: 0, pageCount: 0 },
    } as unknown as TemplateData;
    expect(alternates(discover(data))).toEqual([
      "application/rss+xml https://cms.example/post/feed",
      "application/atom+xml https://cms.example/post/feed/atom",
    ]);
  });

  test("an archive of a non-public type advertises nothing", () => {
    const data = {
      kind: "archive",
      contentType: "secret",
      entries: [],
      pagination: { page: 1, perPage: 10, total: 0, pageCount: 0 },
    } as unknown as TemplateData;
    expect(discover(data).link).toBeUndefined();
  });

  test("single-entry data advertises the site feed (not its type feed)", () => {
    const data = {
      kind: "entry",
      entry: { type: "post" },
    } as unknown as TemplateData;
    expect(alternates(discover(data))).toEqual([
      "application/rss+xml https://cms.example/feed",
      "application/atom+xml https://cms.example/feed/atom",
    ]);
  });

  test("top-level taxonomy-term data advertises the term feed", () => {
    const data = {
      kind: "taxonomy",
      taxonomy: "category",
      term: { slug: "news", parentId: null, url: "/category/news" },
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(alternates(discover(data))).toEqual([
      "application/rss+xml https://cms.example/category/news/feed",
      "application/atom+xml https://cms.example/category/news/feed/atom",
    ]);
  });

  test("a nested term advertises its nested feed where the taxonomy exposes hierarchical URLs", () => {
    const data = {
      kind: "taxonomy",
      taxonomy: "region",
      term: { slug: "france", parentId: 1, url: "/region/europe/france" },
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(alternates(discover(data))).toEqual([
      "application/rss+xml https://cms.example/region/europe/france/feed",
      "application/atom+xml https://cms.example/region/europe/france/feed/atom",
    ]);
  });

  test("a nested term under a flat taxonomy advertises nothing", () => {
    const data = {
      kind: "taxonomy",
      taxonomy: "category",
      term: { slug: "local", parentId: 1, url: "/category/local" },
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(discover(data).link).toBeUndefined();
  });

  test("author data advertises the author feed", () => {
    const data = {
      kind: "author",
      author: { slug: "jane" },
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(alternates(discover(data))).toEqual([
      "application/rss+xml https://cms.example/authors/jane/feed",
      "application/atom+xml https://cms.example/authors/jane/feed/atom",
    ]);
  });

  test("date data advertises the period's feed at its own granularity", () => {
    const data = {
      kind: "date",
      year: 2026,
      month: 7,
      day: null,
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(alternates(discover(data))).toEqual([
      "application/rss+xml https://cms.example/2026/07/feed",
      "application/atom+xml https://cms.example/2026/07/feed/atom",
    ]);
  });

  test("a search page and a plugin archive advertise nothing", () => {
    const search = {
      kind: "search",
      query: "x",
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(discover(search).link).toBeUndefined();

    const custom = {
      kind: "custom",
      name: "weekly-menu",
    } as unknown as TemplateData;
    expect(discover(custom).link).toBeUndefined();
  });

  test("a private site advertises nothing on a page that would otherwise have a feed", () => {
    expect(discover(frontPage, {}, true).link).toBeUndefined();
  });

  test("does not duplicate an alternate the template already set", () => {
    const seeded: DocumentManifest = {
      link: [
        {
          rel: "alternate",
          type: "application/rss+xml",
          href: "https://cms.example/custom",
        },
      ],
    };
    const out = applyFeedDiscovery(seeded, frontPage, ctx, false);
    expect(alternates(out)).toEqual([
      "application/rss+xml https://cms.example/custom",
      "application/atom+xml https://cms.example/feed/atom",
    ]);
  });
});
