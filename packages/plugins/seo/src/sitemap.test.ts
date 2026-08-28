import { describe, expect, test } from "vitest";

import type { SitemapUrl } from "./sitemap.js";
import { renderSitemapIndex, renderSubSitemap } from "./sitemap.js";

const XSL = "/sitemap.xsl";

describe("renderSitemapIndex", () => {
  test("wraps each loc in a <sitemap> entry", () => {
    const xml = renderSitemapIndex(
      [
        "https://cms.example/sitemap-post-1.xml",
        "https://cms.example/sitemap-category-1.xml",
      ],
      XSL,
    );
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
    expect(renderSitemapIndex([], XSL)).toContain("<sitemapindex");
    expect(renderSitemapIndex([], XSL)).not.toContain("<sitemap>");
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
    const xml = renderSubSitemap(urls, XSL);
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
    const xml = renderSubSitemap(
      [{ loc: "https://cms.example/post/a?x=1&y=2" }],
      XSL,
    );
    expect(xml).toContain("a?x=1&amp;y=2");
    expect(xml).not.toContain("x=1&y=2");
  });
});

describe("sitemap image entries", () => {
  test("emits an image entry per image, under the image namespace", () => {
    const xml = renderSubSitemap(
      [
        {
          loc: "https://cms.example/post/a",
          images: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
        },
      ],
      XSL,
    );
    expect(xml).toContain(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
    );
    expect(xml).toContain(
      "<image:image><image:loc>https://cdn.example/a.png</image:loc></image:image>",
    );
    expect(xml.match(/<image:image>/g)).toHaveLength(2);
  });

  test("a set with no image declares no image namespace", () => {
    const xml = renderSubSitemap([{ loc: "https://cms.example/post/a" }], XSL);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).not.toContain("image");
  });

  test("escapes XML metacharacters in an image loc", () => {
    const xml = renderSubSitemap(
      [
        {
          loc: "https://cms.example/post/a",
          images: ["https://cdn.example/a.png?w=1&h=2"],
        },
      ],
      XSL,
    );
    expect(xml).toContain("a.png?w=1&amp;h=2");
  });
});
