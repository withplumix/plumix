import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { PublicRouteTable } from "../route/public-routes.js";
import { compilePublicRoutes } from "../route/public-routes.js";
import { canonicalRedirectTarget, canonicalUrl } from "./canonical.js";

const NO_PUBLIC_ROUTES = compilePublicRoutes([]);

function publicRoutes(...paths: readonly string[]): PublicRouteTable {
  return compilePublicRoutes(
    paths.map((path) => ({
      pluginId: "feeds",
      path,
      handler: () => new Response("ok"),
    })),
  );
}

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

function targetFor(url: string, routes = NO_PUBLIC_ROUTES): string | null {
  return canonicalRedirectTarget(ctxFor(url), routes);
}

describe("canonicalRedirectTarget", () => {
  test("trailing slash redirects to the slash-less canonical", () => {
    expect(targetFor("https://cms.example/about/")).toBe(
      "https://cms.example/about",
    );
  });

  test("/page/1 redirects to the bare listing", () => {
    expect(targetFor("https://cms.example/shop/page/1")).toBe(
      "https://cms.example/shop",
    );
  });

  test("an already-canonical URL is not redirected (no loop)", () => {
    expect(targetFor("https://cms.example/about")).toBeNull();
  });

  test("the query string is preserved on the redirect", () => {
    expect(targetFor("https://cms.example/about/?utm=x&p=2")).toBe(
      "https://cms.example/about?utm=x&p=2",
    );
  });

  test.each([
    ["root", "https://cms.example/"],
    ["plumix surface", "https://cms.example/_plumix/admin/"],
    ["robots", "https://cms.example/robots.txt"],
    ["dotted asset", "https://cms.example/favicon.ico/"],
    ["sitemap xml", "https://cms.example/sitemap.xml/"],
  ])("exempt: %s is never redirected", (_label, url) => {
    expect(targetFor(url)).toBeNull();
  });

  test("a registered public route is exempt; a variant of one still normalizes onto it", () => {
    // The exemption is the literal path, so a dot-less registered endpoint is
    // never 301'd — and a trailing-slash variant of it is 301'd *at* it, which
    // is what gets an aggregator to the feed rather than to the 404 the
    // content router would answer with.
    expect(
      targetFor(
        "https://cms.example/syndication",
        publicRoutes("/syndication"),
      ),
    ).toBeNull();
    expect(
      targetFor(
        "https://cms.example/syndication/",
        publicRoutes("/syndication"),
      ),
    ).toBe("https://cms.example/syndication");
  });

  test("a feed-prefixed real page is still canonicalized", () => {
    // `/feedback` only shares a prefix with `/feed`; it's a normal page.
    expect(targetFor("https://cms.example/feedback/")).toBe(
      "https://cms.example/feedback",
    );
  });
});
