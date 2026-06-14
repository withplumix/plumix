import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { canonicalRedirectTarget, canonicalUrl } from "./canonical.js";

function ctxFor(url: string, basePath = ""): AppContext {
  return {
    request: new Request(url),
    origin: "https://cms.example",
    basePath,
  } as unknown as AppContext;
}

describe("canonicalUrl", () => {
  test.each([
    [
      "single entry",
      "https://cms.example/post/hello",
      "https://cms.example/post/hello",
    ],
    ["archive", "https://cms.example/post", "https://cms.example/post"],
    [
      "taxonomy term",
      "https://cms.example/category/tech",
      "https://cms.example/category/tech",
    ],
    ["front page", "https://cms.example/", "https://cms.example/"],
    [
      "trailing slash normalized away",
      "https://cms.example/post/hello/",
      "https://cms.example/post/hello",
    ],
    [
      "query string dropped",
      "https://cms.example/post/hello?utm=x",
      "https://cms.example/post/hello",
    ],
    [
      "page 1 collapses to the bare listing",
      "https://cms.example/shop/page/1",
      "https://cms.example/shop",
    ],
    [
      "page 2+ is kept",
      "https://cms.example/shop/page/2",
      "https://cms.example/shop/page/2",
    ],
  ])("%s → slash-less absolute URL", (_label, requestUrl, expected) => {
    expect(canonicalUrl(ctxFor(requestUrl))).toBe(expected);
  });

  test("uses the configured origin, not the request host", () => {
    // A request served by an internal/edge host still canonicalizes to the
    // configured site origin.
    expect(canonicalUrl(ctxFor("https://edge.internal/post/hello"))).toBe(
      "https://cms.example/post/hello",
    );
  });
});

describe("canonicalRedirectTarget", () => {
  test("trailing slash redirects to the slash-less canonical", () => {
    expect(canonicalRedirectTarget(ctxFor("https://cms.example/about/"))).toBe(
      "https://cms.example/about",
    );
  });

  test("/page/1 redirects to the bare listing", () => {
    expect(
      canonicalRedirectTarget(ctxFor("https://cms.example/shop/page/1")),
    ).toBe("https://cms.example/shop");
  });

  test("an already-canonical URL is not redirected (no loop)", () => {
    expect(
      canonicalRedirectTarget(ctxFor("https://cms.example/about")),
    ).toBeNull();
  });

  test("the query string is preserved on the redirect", () => {
    expect(
      canonicalRedirectTarget(ctxFor("https://cms.example/about/?utm=x&p=2")),
    ).toBe("https://cms.example/about?utm=x&p=2");
  });

  test.each([
    ["root", "https://cms.example/"],
    ["plumix surface", "https://cms.example/_plumix/admin/"],
    ["robots", "https://cms.example/robots.txt"],
    ["feed", "https://cms.example/feed/"],
    ["sub-feed", "https://cms.example/feed/atom/"],
    ["dotted asset", "https://cms.example/favicon.ico/"],
    ["sitemap xml", "https://cms.example/sitemap.xml/"],
  ])("exempt: %s is never redirected", (_label, url) => {
    expect(canonicalRedirectTarget(ctxFor(url))).toBeNull();
  });

  test("a feed-prefixed real page is still canonicalized", () => {
    // `/feedback` only shares a prefix with `/feed`; it's a normal page.
    expect(
      canonicalRedirectTarget(ctxFor("https://cms.example/feedback/")),
    ).toBe("https://cms.example/feedback");
  });
});
