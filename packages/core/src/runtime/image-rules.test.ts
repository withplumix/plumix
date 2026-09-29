import { describe, expect, test } from "vitest";

import {
  fetchRemoteImageSource,
  imageSourceKey,
  imageTransformUrl,
  negotiateImageFormat,
  parseImageParams,
} from "./image-rules.js";

const WIDTHS = [320, 640, 1280];
const EVERY_FORMAT = ["jpeg", "webp", "avif"] as const;
const NO_AVIF = ["jpeg", "webp"] as const;

const query = (search: string) => new URLSearchParams(search);

describe("parseImageParams", () => {
  test("snaps the width up the roster, scales a crop's height with it, and clamps quality", () => {
    expect(
      parseImageParams(WIDTHS, query("src=/a.png&w=500&h=250&q=999&fit=cover")),
    ).toEqual({
      src: "/a.png",
      width: 640,
      height: 320,
      quality: 100,
      fit: "cover",
    });
    expect(parseImageParams(WIDTHS, query("src=/a.png&w=0&q=0"))).toEqual({
      src: "/a.png",
      width: 320,
      quality: 1,
    });
    // A bare height is bounded by the roster's ceiling.
    expect(parseImageParams(WIDTHS, query("src=/a.png&h=9000"))).toEqual({
      src: "/a.png",
      height: 1280,
    });
  });

  test("is null for a query it cannot read", () => {
    for (const search of [
      "w=320",
      "src=/a.png&w=abc",
      "src=/a.png&f=bmp",
      "src=/a.png&fit=stretch",
    ]) {
      expect(parseImageParams(WIDTHS, query(search))).toBeNull();
    }
  });
});

describe("imageTransformUrl", () => {
  const rules = { widths: WIDTHS, remotePatterns: [], basePath: "" };

  test("routes a transform onto /_plumix/image and leaves a bare source alone", () => {
    const url = imageTransformUrl(rules, "/a.png", { width: 300, dpr: 2 });
    expect(url).toBe("/_plumix/image?src=%2Fa.png&w=640");
    expect(imageTransformUrl(rules, "/a.png", { format: "auto" })).toBe(
      "/a.png",
    );
  });

  test("prefixes the base path, and hands back a remote source no pattern allows", () => {
    expect(
      imageTransformUrl({ ...rules, basePath: "/cms" }, "/a.png", {
        width: 320,
      }),
    ).toBe("/cms/_plumix/image?src=%2Fa.png&w=320");
    expect(
      imageTransformUrl(rules, "https://elsewhere.example/a.png", {
        width: 320,
      }),
    ).toBe("https://elsewhere.example/a.png");
  });
});

describe("negotiateImageFormat", () => {
  test("prefers AVIF, then WebP, among what the host can encode", () => {
    const accept = "image/avif,image/webp,image/*,*/*;q=0.8";
    expect(negotiateImageFormat(undefined, accept, EVERY_FORMAT)).toBe("avif");
    expect(negotiateImageFormat(undefined, accept, NO_AVIF)).toBe("webp");
  });

  test("a host without AVIF keeps the source type when WebP is not accepted", () => {
    expect(
      negotiateImageFormat(undefined, "image/avif,*/*;q=0.8", NO_AVIF),
    ).toBe("source");
  });

  test("q=0 refuses a format, and the bare full wildcard accepts none", () => {
    expect(
      negotiateImageFormat(undefined, "image/avif;q=0", EVERY_FORMAT),
    ).toBe("source");
    expect(
      negotiateImageFormat(
        undefined,
        "image/avif;q=0, image/*;q=0.5",
        EVERY_FORMAT,
      ),
    ).toBe("webp");
    expect(negotiateImageFormat(undefined, "*/*", EVERY_FORMAT)).toBe("source");
    expect(negotiateImageFormat(undefined, undefined, EVERY_FORMAT)).toBe(
      "source",
    );
  });

  test("an explicit format wins when the host can encode it, and is negotiated when it cannot", () => {
    expect(negotiateImageFormat("jpeg", "image/avif", EVERY_FORMAT)).toBe(
      "jpeg",
    );
    expect(negotiateImageFormat("avif", "image/webp", NO_AVIF)).toBe("webp");
  });
});

describe("imageSourceKey", () => {
  test("names a source without its query, a same-host one by its path", () => {
    expect(imageSourceKey("/a.png?v=2")).toBe("/a.png");
    expect(imageSourceKey("https://cdn.example/a.png?v=2")).toBe(
      "https://cdn.example/a.png",
    );
    const request = new URL("http://site.example/_plumix/image");
    expect(imageSourceKey("https://site.example/a.png?v=2", request)).toBe(
      "/a.png",
    );
    expect(imageSourceKey("https://cdn.example/a.png", request)).toBe(
      "https://cdn.example/a.png",
    );
  });
});

describe("fetchRemoteImageSource", () => {
  const PATTERNS = [{ hostname: "img.example" }];

  // A web of redirects on two hosts, answered without the network.
  function stubFetch(): { fetch: typeof fetch; requested: string[] } {
    const requested: string[] = [];
    const redirect = (location: string) =>
      new Response(null, { status: 302, headers: { location } });
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input);
      requested.push(url.href);
      switch (url.pathname) {
        case "/r.png":
          return Promise.resolve(new Response("pixels"));
        case "/hop":
          return Promise.resolve(redirect("/r.png"));
        case "/away":
          return Promise.resolve(redirect("https://evil.example/r.png"));
        case "/loop":
          return Promise.resolve(redirect("/loop"));
        default:
          return Promise.resolve(new Response(null, { status: 500 }));
      }
    };
    return { fetch, requested };
  }

  const options = (fetch: typeof globalThis.fetch) => ({
    remotePatterns: PATTERNS,
    route: "/_plumix/image",
    fetch,
  });

  test("fetches a permitted source, following a redirect that stays permitted", async () => {
    const stub = stubFetch();
    const result = await fetchRemoteImageSource(
      "https://img.example/hop",
      options(stub.fetch),
    );
    expect(result.ok && (await result.response.text())).toBe("pixels");
    expect(stub.requested).toEqual([
      "https://img.example/hop",
      "https://img.example/r.png",
    ]);
  });

  test("refuses a source no pattern allows, and a redirect that leaves the patterns, before fetching it", async () => {
    const stub = stubFetch();
    expect(
      await fetchRemoteImageSource(
        "https://evil.example/r.png",
        options(stub.fetch),
      ),
    ).toEqual({ ok: false, status: 400 });
    expect(
      await fetchRemoteImageSource(
        "https://img.example/away",
        options(stub.fetch),
      ),
    ).toEqual({ ok: false, status: 400 });
    expect(stub.requested).toEqual(["https://img.example/away"]);
  });

  test("refuses the route itself as a source", async () => {
    const stub = stubFetch();
    expect(
      await fetchRemoteImageSource(
        "https://img.example/_plumix/image?src=/a.png",
        options(stub.fetch),
      ),
    ).toEqual({ ok: false, status: 400 });
    expect(stub.requested).toEqual([]);
  });

  test("gives up after 10 redirects", async () => {
    const stub = stubFetch();
    expect(
      await fetchRemoteImageSource(
        "https://img.example/loop",
        options(stub.fetch),
      ),
    ).toEqual({ ok: false, status: 400 });
    expect(stub.requested).toHaveLength(11);
  });

  test("a permitted host that fails is 502", async () => {
    const stub = stubFetch();
    expect(
      await fetchRemoteImageSource(
        "https://img.example/broken",
        options(stub.fetch),
      ),
    ).toEqual({ ok: false, status: 502 });
  });
});
