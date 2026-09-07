import { describe, expect, test } from "vitest";

import { ImagesError } from "./errors.js";
import { images, parseImageParams } from "./images.js";

const params = (url: string) => new URL(url, "http://localhost").searchParams;

describe("images() — URL math onto /_plumix/image", () => {
  test("returns the source unchanged when no transform is asked for", () => {
    const slot = images();
    expect(slot.url("/_plumix/media/serve/1")).toBe("/_plumix/media/serve/1");
    expect(slot.url("/_plumix/media/serve/1", {})).toBe(
      "/_plumix/media/serve/1",
    );
    expect(slot.url("/_plumix/media/serve/1", { format: "auto" })).toBe(
      "/_plumix/media/serve/1",
    );
  });

  test("refuses a cacheSize that is not a positive integer", () => {
    for (const cacheSize of [0, -1, 1.5, Number.NaN]) {
      expect(() => images({ cacheSize })).toThrow(ImagesError);
    }
    expect(images({ cacheSize: 1 }).config.cacheSize).toBe(1);
    expect(images().config.cacheSize).toBe(1024 ** 3);
  });

  test("declares that it resolves same-origin relative sources itself", () => {
    expect(images().acceptsRelativeSources).toBe(true);
    expect(images().kind).toBe("node-images");
  });

  test("routes a same-origin source with its width snapped up to the roster", () => {
    const slot = images({ widths: [320, 640, 1280] });
    const url = slot.url("/_plumix/media/serve/1", { width: 500 });
    expect(url.startsWith("/_plumix/image?")).toBe(true);
    expect(params(url).get("src")).toBe("/_plumix/media/serve/1");
    expect(params(url).get("w")).toBe("640");
  });

  test("a width past the roster takes its largest entry, never more", () => {
    const slot = images({ widths: [320, 640, 1280] });
    expect(params(slot.url("/a.png", { width: 4000 })).get("w")).toBe("1280");
    expect(params(slot.url("/a.png", { width: 1280 })).get("w")).toBe("1280");
    expect(params(slot.url("/a.png", { width: 1 })).get("w")).toBe("320");
  });

  test("dpr multiplies the width before it snaps", () => {
    const slot = images({ widths: [320, 640, 1280] });
    expect(params(slot.url("/a.png", { width: 300, dpr: 2 })).get("w")).toBe(
      "640",
    );
  });

  test("clamps quality into 1..100", () => {
    const slot = images();
    expect(params(slot.url("/a.png", { quality: 500 })).get("q")).toBe("100");
    expect(params(slot.url("/a.png", { quality: -3 })).get("q")).toBe("1");
    expect(params(slot.url("/a.png", { quality: 72 })).get("q")).toBe("72");
  });

  test("carries an explicit format and leaves auto to the route's negotiation", () => {
    const slot = images();
    expect(params(slot.url("/a.png", { format: "jpeg" })).get("f")).toBe(
      "jpeg",
    );
    expect(
      params(slot.url("/a.png", { width: 320, format: "auto" })).has("f"),
    ).toBe(false);
  });

  test("keeps a crop's aspect when the width snaps, and carries the fit", () => {
    const slot = images({ widths: [640, 1280] });
    const url = slot.url("/a.png", { width: 1200, height: 630, fit: "cover" });
    expect(params(url).get("w")).toBe("1280");
    expect(params(url).get("h")).toBe("672");
    expect(params(url).get("fit")).toBe("cover");
  });

  test("routes a remote source that matches the roster and passes the rest through unchanged", () => {
    const slot = images({
      remotePatterns: [{ hostname: "images.example.com" }],
    });
    const allowed = slot.url("https://images.example.com/a.jpg", {
      width: 640,
    });
    expect(params(allowed).get("src")).toBe("https://images.example.com/a.jpg");
    expect(slot.url("https://other.example.com/a.jpg", { width: 640 })).toBe(
      "https://other.example.com/a.jpg",
    );
    expect(
      images().url("https://images.example.com/a.jpg", { width: 640 }),
    ).toBe("https://images.example.com/a.jpg");
  });

  test("refuses an empty or non-integer roster up front", () => {
    expect(() => images({ widths: [] })).toThrow(/widths/);
    expect(() => images({ widths: [100.5] })).toThrow(/widths/);
    expect(() => images({ widths: [0] })).toThrow(/widths/);
  });

  test("connect() prefixes the route with the resolved basePath", () => {
    const slot = images();
    const connected = slot.connect?.({}, { basePath: "/cms" });
    expect(connected?.url("/a.png", { width: 320 })).toMatch(
      /^\/cms\/_plumix\/image\?/,
    );
    // A root deployment, or connecting without a ctx at all, is unchanged.
    expect(
      slot.connect?.({}, { basePath: "" })?.url("/a.png", { width: 320 }),
    ).toMatch(/^\/_plumix\/image\?/);
    expect(slot.connect?.({})?.url("/a.png", { width: 320 })).toMatch(
      /^\/_plumix\/image\?/,
    );
  });

  test("connecting the same slot twice with different basePaths keeps each independent", () => {
    const slot = images();
    const cms = slot.connect?.({}, { basePath: "/cms" });
    const blog = slot.connect?.({}, { basePath: "/blog" });
    // Neither connection mutated the shared slot or leaked into the other.
    expect(cms?.url("/a.png", { width: 320 })).toMatch(/^\/cms\/_plumix\//);
    expect(blog?.url("/a.png", { width: 320 })).toMatch(/^\/blog\/_plumix\//);
    expect(slot.url("/a.png", { width: 320 })).toMatch(/^\/_plumix\//);
  });
});

describe("parseImageParams — what the route accepts", () => {
  const slot = images({ widths: [320, 640, 1280] });

  test("snaps and clamps a hand-written query the way url() does", () => {
    expect(
      parseImageParams(slot.config, params("?src=/a.png&w=700&q=999")),
    ).toEqual({ src: "/a.png", width: 1280, quality: 100 });
  });

  test("a width or quality below range rises to the floor rather than failing", () => {
    expect(
      parseImageParams(slot.config, params("?src=/a.png&w=0&q=-4")),
    ).toEqual({ src: "/a.png", width: 320, quality: 1 });
  });

  test("refuses a missing src, an unparseable width, or an unknown format", () => {
    expect(parseImageParams(slot.config, params("?w=640"))).toBeNull();
    expect(
      parseImageParams(slot.config, params("?src=/a.png&w=abc")),
    ).toBeNull();
    expect(
      parseImageParams(slot.config, params("?src=/a.png&f=bmp")),
    ).toBeNull();
    expect(
      parseImageParams(slot.config, params("?src=/a.png&fit=zoom")),
    ).toBeNull();
  });

  test("bounds a height by the roster's largest width", () => {
    expect(
      parseImageParams(slot.config, params("?src=/a.png&w=640&h=99999")),
    ).toEqual({ src: "/a.png", width: 640, height: 1280 });
  });
});
