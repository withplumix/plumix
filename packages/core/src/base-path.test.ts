import { describe, expect, test } from "vitest";

import { normalizeBasePath, stripBasePath, withBasePath } from "./base-path.js";

describe("normalizeBasePath", () => {
  test.each([
    ["undefined → root", undefined, ""],
    ["empty → root", "", ""],
    ["bare slash → root", "/", ""],
    ["already canonical", "/docs", "/docs"],
    ["adds the leading slash", "docs", "/docs"],
    ["strips the trailing slash", "/docs/", "/docs"],
    ["strips repeated trailing slashes", "/docs///", "/docs"],
    ["collapses internal duplicate slashes", "/a//b", "/a/b"],
    ["nested path", "/a/b/c", "/a/b/c"],
    ["trims surrounding whitespace", "  /docs  ", "/docs"],
  ])("%s", (_label, input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });
});

describe("stripBasePath", () => {
  test("root base is a pure pass-through (byte-identical to no base path)", () => {
    expect(stripBasePath("/post/hello", "")).toBe("/post/hello");
    expect(stripBasePath("/_plumix/admin", "")).toBe("/_plumix/admin");
    expect(stripBasePath("/", "")).toBe("/");
  });

  test("the exact base maps to the site root", () => {
    expect(stripBasePath("/docs", "/docs")).toBe("/");
    expect(stripBasePath("/docs/", "/docs")).toBe("/");
  });

  test("a path under the base is returned with the prefix removed", () => {
    expect(stripBasePath("/docs/post/hello", "/docs")).toBe("/post/hello");
    expect(stripBasePath("/docs/_plumix/admin", "/docs")).toBe(
      "/_plumix/admin",
    );
  });

  test("a path that merely shares the base's stem is not under the base", () => {
    expect(stripBasePath("/docsss", "/docs")).toBeNull();
  });

  test("a path outside the base returns null (caller 404s)", () => {
    expect(stripBasePath("/post/hello", "/docs")).toBeNull();
    expect(stripBasePath("/", "/docs")).toBeNull();
  });

  test("duplicate leading slashes can't smuggle a path past the base gate", () => {
    // `//docs/admin` must not be treated as outside-the-base and slip through;
    // it collapses to `/docs/admin` before matching.
    expect(stripBasePath("//docs/admin", "/docs")).toBe("/admin");
  });

  test("strip and prefix round-trip back to the original path", () => {
    const stripped = stripBasePath("/docs/post/hello", "/docs");
    expect(stripped).not.toBeNull();
    expect(withBasePath(stripped ?? "", "/docs")).toBe("/docs/post/hello");
  });
});

describe("withBasePath", () => {
  test("root base is a pure pass-through", () => {
    expect(withBasePath("/post/hello", "")).toBe("/post/hello");
    expect(withBasePath("/", "")).toBe("/");
  });

  test("prepends the base to a root-relative path", () => {
    expect(withBasePath("/post/hello", "/docs")).toBe("/docs/post/hello");
  });

  test("the site root under a base is the bare base (no trailing slash)", () => {
    expect(withBasePath("/", "/docs")).toBe("/docs");
  });
});
