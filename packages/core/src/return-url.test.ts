import { describe, expect, test } from "vitest";

import { resolveReturnUrl } from "./return-url.js";

const SUBMIT = "/_plumix/forms/submit";
const ctx = { origin: "https://site.example", basePath: "" };

const post = (
  url = `https://site.example${SUBMIT}`,
  referer?: string,
): Request =>
  new Request(url, {
    method: "POST",
    headers: referer === undefined ? undefined : { referer },
  });

const resolve = (
  returnTo: string | null | undefined,
  request = post(),
  context = ctx,
) => resolveReturnUrl(request, context, { returnTo, endpoint: SUBMIT });

describe("resolveReturnUrl", () => {
  test("resolves a relative candidate against the request URL", () => {
    expect(resolve("/posts/hello#comments")).toBe(
      "https://site.example/posts/hello#comments",
    );
  });

  test("accepts an absolute candidate on the configured origin", () => {
    expect(resolve("https://site.example/posts/hello")).toBe(
      "https://site.example/posts/hello",
    );
  });

  // The pair the dispatcher's own Origin check accepts. Holding to the
  // configured origin alone sends every visitor on a second host to the root.
  test("accepts the request's own origin when it is not the configured one", () => {
    expect(
      resolve("/posts/hello", post(`https://other.example${SUBMIT}`)),
    ).toBe("https://other.example/posts/hello");
  });

  test("refuses a candidate on a foreign origin", () => {
    expect(resolve("https://evil.example/phish")).toBe("/");
  });

  test.each([
    [
      "a blob: URL, whose origin is its inner one",
      "blob:https://site.example/x",
    ],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<h1>hi</h1>"],
    ["a protocol-relative URL", "//evil.example"],
  ])("refuses %s", (_label, candidate) => {
    expect(resolve(candidate)).toBe("/");
  });

  test("refuses the endpoint's own path, so the answer cannot loop", () => {
    expect(resolve(`https://site.example${SUBMIT}`)).toBe("/");
  });

  describe("falling back to the Referer", () => {
    test("takes it when the field is absent", () => {
      const request = post(undefined, "https://site.example/posts/hello");
      expect(resolve(null, request)).toBe("https://site.example/posts/hello");
    });

    test("still refuses it when it is the endpoint itself", () => {
      const request = post(undefined, `https://site.example${SUBMIT}`);
      expect(resolve(null, request)).toBe("/");
    });

    test("prefers the field over it", () => {
      const request = post(undefined, "https://site.example/referred");
      expect(resolve("/from-the-field", request)).toBe(
        "https://site.example/from-the-field",
      );
    });
  });

  test("falls back to the site root when nothing is usable", () => {
    expect(resolve(null)).toBe("/");
  });

  describe("under a subdirectory deployment", () => {
    const sub = { origin: "https://site.example", basePath: "/blog" };
    const request = post(`https://site.example/blog${SUBMIT}`);

    test("refuses the endpoint at its based path", () => {
      expect(resolve(`https://site.example/blog${SUBMIT}`, request, sub)).toBe(
        "/blog",
      );
    });

    test("falls back to the base, not the domain root", () => {
      expect(resolve(null, request, sub)).toBe("/blog");
    });
  });
});
