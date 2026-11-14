import { describe, expect, it } from "vitest";

import {
  applyClientCopy,
  pageClientCopy,
  privateClientCopy,
} from "./client-copy.js";
import { UNIVERSAL_COPY_HEADER } from "./universal-copy.js";

describe("privateClientCopy", () => {
  it("adds cookie to a member page that varies on another header", () => {
    const page = new Response("page", {
      headers: { vary: "accept-language" },
    });

    const copy = privateClientCopy(page);

    expect(copy.headers.get("vary")).toBe("accept-language, cookie");
  });

  it("names cookie once when the page already varies on it", () => {
    const page = new Response("page", {
      headers: { vary: "Accept-Language, Cookie" },
    });

    const copy = privateClientCopy(page);

    expect(copy.headers.get("vary")).toBe("Accept-Language, Cookie");
  });
});

function universalCopy(): Response {
  return new Response("page", {
    headers: {
      "cache-control": "public, s-maxage=3600",
      "cache-tag": "e:1,t:post",
      [UNIVERSAL_COPY_HEADER]: "1",
    },
  });
}

describe("the universal reader's client copy", () => {
  it("lets the reader's browser keep the universal copy only while it revalidates", () => {
    const copy = applyClientCopy(universalCopy(), "universal-reader");

    expect(copy.headers.get("cache-control")).toBe("private, no-cache");
    expect(copy.headers.get("vary")).toBe("cookie");
    expect(copy.headers.has("cache-tag")).toBe(false);
    expect(copy.headers.has(UNIVERSAL_COPY_HEADER)).toBe(false);
  });

  it("keeps the reader's own render private", () => {
    const live = new Response("member page", {
      headers: { "cache-control": "public, s-maxage=3600" },
    });

    const copy = applyClientCopy(live, "universal-reader");

    expect(copy.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("pageClientCopy", () => {
  it("drops the universal marker from an anonymous hit", () => {
    const copy = pageClientCopy(universalCopy());

    expect(copy.headers.has(UNIVERSAL_COPY_HEADER)).toBe(false);
    expect(copy.headers.get("cache-control")).toBe("public, s-maxage=3600");
  });
});

describe("the front cache's client copy", () => {
  it("keeps the universal marker for the front cache to read", () => {
    const copy = applyClientCopy(universalCopy(), "front-cache");

    expect(copy.headers.get(UNIVERSAL_COPY_HEADER)).toBe("1");
    expect(copy.headers.get("cache-control")).toBe("public, s-maxage=3600");
    expect(copy.headers.get("cache-tag")).toBe("e:1,t:post");
  });

  it("keeps a page that declares no Cache-Control out of the front cache", () => {
    const copy = applyClientCopy(new Response("404"), "front-cache");

    expect(copy.headers.get("cache-control")).toBe("private, no-cache");
  });
});
