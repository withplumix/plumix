import { describe, expect, test } from "vitest";

import type { FeedChannel, FeedItem } from "./serialize.js";
import { renderAtom, renderRss2 } from "./serialize.js";

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
