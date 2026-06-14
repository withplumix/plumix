import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { DocumentManifest, TemplateData } from "../theme.js";
import type { FeedChannel, FeedItem } from "./feed.js";
import { applyFeedDiscovery, renderAtom, renderRss2 } from "./feed.js";

const CHANNEL: FeedChannel = {
  title: "Acme Blog",
  link: "https://cms.example",
  feedUrl: "https://cms.example/feed",
  description: "News & notes",
  updated: "2026-06-14T10:00:00.000Z",
};

const ITEMS: readonly FeedItem[] = [
  {
    title: "Hello & welcome",
    link: "https://cms.example/post/hello",
    id: "https://cms.example/post/hello",
    updated: "2026-06-14T10:00:00.000Z",
    published: "2026-06-14T09:00:00.000Z",
    summary: "First <post>",
    author: "Ada",
  },
  {
    title: "Second",
    link: "https://cms.example/post/second",
    id: "https://cms.example/post/second",
    updated: "2026-06-13T10:00:00.000Z",
  },
];

describe("renderRss2", () => {
  test("emits a valid RSS2 channel with one <item> per entry", () => {
    const xml = renderRss2(CHANNEL, ITEMS);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Acme Blog</title>");
    expect(xml).toContain("<link>https://cms.example</link>");
    expect(xml).toContain(
      '<atom:link href="https://cms.example/feed" rel="self" type="application/rss+xml"></atom:link>',
    );
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain(
      '<guid isPermaLink="true">https://cms.example/post/hello</guid>',
    );
    // RSS2 dates are RFC-822.
    expect(xml).toContain("<pubDate>Sun, 14 Jun 2026 09:00:00 GMT</pubDate>");
  });

  test("escapes XML metacharacters in titles and summaries", () => {
    const xml = renderRss2(CHANNEL, ITEMS);
    expect(xml).toContain("<title>Hello &amp; welcome</title>");
    expect(xml).toContain("<description>First &lt;post&gt;</description>");
    expect(xml).not.toContain("<post>");
  });

  test("emits dc:creator only when the item has an author", () => {
    const xml = renderRss2(CHANNEL, ITEMS);
    expect(xml).toContain("<dc:creator>Ada</dc:creator>");
    expect(xml.match(/<dc:creator>/g)).toHaveLength(1);
  });
});

describe("renderAtom", () => {
  test("emits a valid Atom feed with one <entry> per item", () => {
    const xml = renderAtom(CHANNEL, ITEMS);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain("<id>https://cms.example/feed</id>");
    expect(xml).toContain(
      '<link href="https://cms.example/feed" rel="self"></link>',
    );
    expect(xml).toContain("<updated>2026-06-14T10:00:00.000Z</updated>");
    expect(xml.match(/<entry>/g)).toHaveLength(2);
    expect(xml).toContain(
      '<link href="https://cms.example/post/hello"></link>',
    );
    expect(xml).toContain("<author><name>Ada</name></author>");
  });

  test("escapes XML metacharacters", () => {
    const xml = renderAtom(CHANNEL, ITEMS);
    expect(xml).toContain("<title>Hello &amp; welcome</title>");
    expect(xml).not.toContain("<post>");
  });
});

describe("applyFeedDiscovery", () => {
  const ctx = {
    origin: "https://cms.example",
    basePath: "",
    plugins: {
      entryTypes: new Map([["post", { name: "post", isPublic: true }]]),
      termTaxonomies: new Map([
        ["category", { name: "category", isPublic: true }],
      ]),
    },
  } as unknown as AppContext;
  const empty: DocumentManifest = {};
  const alternates = (m: DocumentManifest): readonly string[] =>
    (m.link ?? [])
      .filter((l) => l.rel === "alternate")
      .map((l) => `${String(l.type)} ${String(l.href)}`);

  test("front-page data advertises the site feed (RSS + Atom)", () => {
    const data = {
      entries: [],
      pagination: { page: 1, perPage: 10, total: 0, pageCount: 0 },
    } as unknown as TemplateData;
    expect(
      alternates(
        applyFeedDiscovery(empty, data, ctx, { siteIsPrivate: false }),
      ),
    ).toEqual([
      "application/rss+xml https://cms.example/feed",
      "application/atom+xml https://cms.example/feed/atom",
    ]);
  });

  test("discovery links carry the configured basePath", () => {
    const basedCtx = { ...ctx, basePath: "/custom-directory" } as AppContext;
    const data = {
      entries: [],
      pagination: { page: 1, perPage: 10, total: 0, pageCount: 0 },
    } as unknown as TemplateData;
    expect(
      alternates(
        applyFeedDiscovery(empty, data, basedCtx, { siteIsPrivate: false }),
      ),
    ).toEqual([
      "application/rss+xml https://cms.example/custom-directory/feed",
      "application/atom+xml https://cms.example/custom-directory/feed/atom",
    ]);
  });

  test("archive data advertises the type feed", () => {
    const data = {
      contentType: "post",
      entries: [],
      pagination: { page: 1, perPage: 10, total: 0, pageCount: 0 },
    } as unknown as TemplateData;
    expect(
      alternates(
        applyFeedDiscovery(empty, data, ctx, { siteIsPrivate: false }),
      ),
    ).toEqual([
      "application/rss+xml https://cms.example/post/feed",
      "application/atom+xml https://cms.example/post/feed/atom",
    ]);
  });

  test("single-entry data advertises the site feed (not its type feed)", () => {
    const data = { entry: { type: "post" } } as unknown as TemplateData;
    expect(
      alternates(
        applyFeedDiscovery(empty, data, ctx, { siteIsPrivate: false }),
      ),
    ).toEqual([
      "application/rss+xml https://cms.example/feed",
      "application/atom+xml https://cms.example/feed/atom",
    ]);
  });

  test("top-level taxonomy-term data advertises the term feed", () => {
    const data = {
      taxonomy: "category",
      term: { slug: "news", parentId: null },
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(
      alternates(
        applyFeedDiscovery(empty, data, ctx, { siteIsPrivate: false }),
      ),
    ).toEqual([
      "application/rss+xml https://cms.example/category/news/feed",
      "application/atom+xml https://cms.example/category/news/feed/atom",
    ]);
  });

  test("a nested term advertises no feed (top-level only)", () => {
    const data = {
      taxonomy: "category",
      term: { slug: "local", parentId: 1 },
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(
      applyFeedDiscovery(empty, data, ctx, { siteIsPrivate: false }).link,
    ).toBeUndefined();
  });

  test("search and private pages advertise nothing", () => {
    const search = {
      query: "x",
      entries: [],
      pagination: {},
    } as unknown as TemplateData;
    expect(
      applyFeedDiscovery(empty, search, ctx, { siteIsPrivate: false }).link,
    ).toBeUndefined();

    const front = { entries: [], pagination: {} } as unknown as TemplateData;
    expect(
      applyFeedDiscovery(empty, front, ctx, { siteIsPrivate: true }).link,
    ).toBeUndefined();
  });

  test("does not duplicate an alternate the template already set", () => {
    const front = { entries: [], pagination: {} } as unknown as TemplateData;
    const seeded: DocumentManifest = {
      link: [
        {
          rel: "alternate",
          type: "application/rss+xml",
          href: "https://cms.example/custom",
        },
      ],
    };
    const out = applyFeedDiscovery(seeded, front, ctx, {
      siteIsPrivate: false,
    });
    expect(alternates(out)).toEqual([
      "application/rss+xml https://cms.example/custom",
      "application/atom+xml https://cms.example/feed/atom",
    ]);
  });
});
