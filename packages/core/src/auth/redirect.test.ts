import { describe, expect, test } from "vitest";

import { isSafeRedirect, resolveSafeRedirect } from "./redirect.js";

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

describe("resolveSafeRedirect", () => {
  test("returns the candidate when it is safe", () => {
    expect(resolveSafeRedirect("/account", "/fallback")).toBe("/account");
  });

  test("falls back on an unsafe candidate", () => {
    expect(resolveSafeRedirect("//evil.com", "/fallback")).toBe("/fallback");
  });

  test("falls back on an absent candidate", () => {
    expect(resolveSafeRedirect(null, "/fallback")).toBe("/fallback");
    expect(resolveSafeRedirect(undefined, "/fallback")).toBe("/fallback");
  });
});
