import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { canonicalUrl } from "./canonical.js";

function ctxFor(url: string): AppContext {
  return {
    request: new Request(url),
    origin: "https://cms.example",
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
