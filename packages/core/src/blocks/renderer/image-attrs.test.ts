import { describe, expect, test } from "vitest";

import { buildImageAttrs, matchesRemotePattern } from "./image-attrs.js";

const resolver = (src: string, opts?: { width?: number }): string =>
  opts?.width === undefined ? src : `${src}?w=${opts.width}`;

describe("matchesRemotePattern", () => {
  test("matches an exact hostname, rejects others", () => {
    const patterns = [{ hostname: "cdn.example.com" }];
    expect(
      matchesRemotePattern("https://cdn.example.com/a.jpg", patterns),
    ).toBe(true);
    expect(matchesRemotePattern("https://evil.com/a.jpg", patterns)).toBe(
      false,
    );
  });

  test("* matches a single label, ** matches one-or-more (not the apex)", () => {
    expect(
      matchesRemotePattern("https://a.example.com/x", [
        { hostname: "*.example.com" },
      ]),
    ).toBe(true);
    expect(
      matchesRemotePattern("https://a.b.example.com/x", [
        { hostname: "*.example.com" },
      ]),
    ).toBe(false);
    expect(
      matchesRemotePattern("https://a.b.example.com/x", [
        { hostname: "**.example.com" },
      ]),
    ).toBe(true);
    expect(
      matchesRemotePattern("https://example.com/x", [
        { hostname: "**.example.com" },
      ]),
    ).toBe(false);
  });

  test("honors protocol and pathname constraints", () => {
    expect(
      matchesRemotePattern("http://cdn.x.com/a", [
        { hostname: "cdn.x.com", protocol: "https" },
      ]),
    ).toBe(false);
    expect(
      matchesRemotePattern("https://cdn.x.com/img/a.jpg", [
        { hostname: "cdn.x.com", pathname: "/img/**" },
      ]),
    ).toBe(true);
    expect(
      matchesRemotePattern("https://cdn.x.com/evil/a.jpg", [
        { hostname: "cdn.x.com", pathname: "/img/**" },
      ]),
    ).toBe(false);
  });

  test("rejects unparseable URLs and an empty allowlist", () => {
    expect(matchesRemotePattern("https://cdn.x.com/a", [])).toBe(false);
    expect(matchesRemotePattern("not a url", [{ hostname: "cdn.x.com" }])).toBe(
      false,
    );
  });
});

describe("buildImageAttrs", () => {
  test("emits a 1x/2x density srcset when no sizes are given", () => {
    const a = buildImageAttrs({
      src: "/a.jpg",
      width: 400,
      height: 300,
      resolver,
    });
    expect(a.srcSet).toBe("/a.jpg?w=400 1x, /a.jpg?w=800 2x");
    expect(a.src).toBe("/a.jpg?w=400");
    expect(a.width).toBe(400);
    expect(a.height).toBe(300);
    expect(a.sizes).toBeUndefined();
  });
});

describe("buildImageAttrs — responsive + passthrough", () => {
  test("emits a width-descriptor srcset (bounded at 2x) with sizes", () => {
    const a = buildImageAttrs({
      src: "/a.jpg",
      width: 400,
      height: 300,
      sizes: "100vw",
      resolver,
    });
    expect(a.sizes).toBe("100vw");
    expect(a.srcSet).toBe(
      "/a.jpg?w=400 400w, /a.jpg?w=640 640w, /a.jpg?w=768 768w, /a.jpg?w=800 800w",
    );
    expect(a.src).toBe("/a.jpg?w=800");
  });

  test("passes through unoptimizable sources with no srcset", () => {
    expect(buildImageAttrs({ src: "/a.jpg", width: 10, height: 10 })).toEqual({
      src: "/a.jpg",
      width: 10,
      height: 10,
    });
    expect(
      buildImageAttrs({ src: "/logo.svg", width: 10, height: 10, resolver })
        .srcSet,
    ).toBeUndefined();
    const remote = buildImageAttrs({
      src: "https://evil.com/a.jpg",
      width: 10,
      height: 10,
      resolver,
      remotePatterns: [{ hostname: "cdn.ok.com" }],
    });
    expect(remote.srcSet).toBeUndefined();
    expect(remote.src).toBe("https://evil.com/a.jpg");
  });

  test("densities override the default and dedup", () => {
    expect(
      buildImageAttrs({
        src: "/a.jpg",
        width: 100,
        height: 100,
        densities: [1, 2, 3],
        resolver,
      }).srcSet,
    ).toBe("/a.jpg?w=100 1x, /a.jpg?w=200 2x, /a.jpg?w=300 3x");
  });
});
