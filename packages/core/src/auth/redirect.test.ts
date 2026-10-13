import { describe, expect, test } from "vitest";

import { isSafeRedirect, resolveRedirectTo } from "./redirect.js";

describe("isSafeRedirect", () => {
  test.each([
    ["/", true],
    ["/dashboard", true],
    ["/blog/hello-world", true],
    ["/custom-directory/account?tab=saved", true],
    ["/path#section", true],
  ])("accepts same-origin path %j", (value, expected) => {
    expect(isSafeRedirect(value)).toBe(expected);
  });

  test.each([
    // Protocol-relative — the browser treats `//evil.com` as an absolute
    // navigation to another origin.
    ["//evil.com", false],
    ["//evil.com/path", false],
    // Backslash variants — browsers normalise `\` to `/`, so `/\evil.com`
    // becomes `//evil.com` (open redirect).
    ["/\\evil.com", false],
    ["/\\/evil.com", false],
    ["\\/evil.com", false],
    ["/path\\to", false],
    // Absolute URLs of any scheme.
    ["https://evil.com", false],
    ["http://evil.com", false],
    ["ftp://evil.com", false],
    // Dangerous pseudo-schemes.
    ["javascript:alert(1)", false],
    ["JavaScript:alert(1)", false],
    ["data:text/html,<script>", false],
    // Relative (no leading slash) — ambiguous, reject.
    ["dashboard", false],
    ["../up", false],
    // Header-injection / control characters.
    ["/path\nSet-Cookie: x", false],
    ["/path\rLocation: y", false],
    // TAB (and other C0 controls) — the WHATWG URL parser strips these
    // before parsing, so `/\t/evil.com` reconstructs to `//evil.com`.
    ["/\t/evil.com", false],
    ["/\t//evil.com", false],
    ["/pa\tth", false],
    ["/path\x00", false],
    ["/path\x7f", false],
    // Empty / non-string.
    ["", false],
  ])("rejects unsafe destination %j", (value, expected) => {
    expect(isSafeRedirect(value)).toBe(expected);
  });

  test("rejects non-string input", () => {
    expect(isSafeRedirect(undefined)).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(42)).toBe(false);
  });

  test("accepts a long-but-bounded path and rejects an over-length one", () => {
    expect(isSafeRedirect("/" + "a".repeat(2047))).toBe(true); // 2048 chars
    expect(isSafeRedirect("/" + "a".repeat(2048))).toBe(false); // 2049 chars
  });
});

describe("resolveRedirectTo", () => {
  test.each([
    ["/account", "/account"],
    ["/account?tab=saved#top", "/account?tab=saved#top"],
    ["/", "/"],
  ])("keeps %j with no base path", (value, expected) => {
    expect(resolveRedirectTo(value, "")).toBe(expected);
  });

  test.each([
    "https://evil.example/",
    "//evil.example",
    "/../x",
    "/a/./b",
    "/a/%2e%2E/b",
    "/a/%2E",
    "javascript:alert(1)",
  ])("sends %j to the site root with no base path", (value) => {
    expect(resolveRedirectTo(value, "")).toBe("/");
  });

  test("keeps a dot inside a segment and in the query", () => {
    expect(resolveRedirectTo("/file.txt?next=/../x", "")).toBe(
      "/file.txt?next=/../x",
    );
  });

  test.each([
    ["/blog", "/blog"],
    ["/blog/account", "/blog/account"],
    ["/blog?x=1", "/blog?x=1"],
  ])("keeps %j under base path /blog", (value, expected) => {
    expect(resolveRedirectTo(value, "/blog")).toBe(expected);
  });

  test.each(["/other", "/blogger", "/", "/blog/../other", "//evil.example"])(
    "sends %j to /blog/ under base path /blog",
    (value) => {
      expect(resolveRedirectTo(value, "/blog")).toBe("/blog/");
    },
  );
});
