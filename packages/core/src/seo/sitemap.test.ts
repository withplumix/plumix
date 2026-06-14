import { describe, expect, test } from "vitest";

import type { SitemapUrl } from "./sitemap.js";
import { renderSitemapIndex, renderSubSitemap } from "./sitemap.js";

describe("renderSitemapIndex", () => {
  test("wraps each loc in a <sitemap> entry", () => {
    const xml = renderSitemapIndex([
      "https://cms.example/sitemap-post-1.xml",
      "https://cms.example/sitemap-category-1.xml",
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain(
      "<sitemap><loc>https://cms.example/sitemap-post-1.xml</loc></sitemap>",
    );
    expect(xml.match(/<sitemap>/g)).toHaveLength(2);
  });

  test("empty index is still valid XML", () => {
    expect(renderSitemapIndex([])).toContain("<sitemapindex");
    expect(renderSitemapIndex([])).not.toContain("<sitemap>");
  });
});

describe("renderSubSitemap", () => {
  test("emits a <url> per entry, with lastmod when present", () => {
    const urls: SitemapUrl[] = [
      {
        loc: "https://cms.example/post/a",
        lastmod: "2026-06-14T00:00:00.000Z",
      },
      { loc: "https://cms.example/category/news" },
    ];
    const xml = renderSubSitemap(urls);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain(
      "<url><loc>https://cms.example/post/a</loc><lastmod>2026-06-14T00:00:00.000Z</lastmod></url>",
    );
    expect(xml).toContain(
      "<url><loc>https://cms.example/category/news</loc></url>",
    );
  });

  test("escapes XML metacharacters in loc", () => {
    const xml = renderSubSitemap([
      { loc: "https://cms.example/post/a?x=1&y=2" },
    ]);
    expect(xml).toContain("a?x=1&amp;y=2");
    expect(xml).not.toContain("x=1&y=2");
  });
});
