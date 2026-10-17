import { describe, expect, test } from "vitest";

import {
  BLOCKED_SCHEMES,
  LINK_SCHEMES,
  linkHrefPattern,
  sanitizeHref,
} from "./safe-href.js";

describe("sanitizeHref", () => {
  // The suites below derive their cases from these rosters, so a member
  // deleted from a roster would take its coverage with it silently.
  test("the rosters are what they say they are", () => {
    expect(LINK_SCHEMES).toEqual(["http", "https", "mailto", "tel", "sms"]);
    expect([...BLOCKED_SCHEMES]).toEqual([
      "javascript",
      "vbscript",
      "data",
      "blob",
      "view-source",
      "file",
    ]);
  });

  test.each([
    "http://example.com",
    "https://example.com/a",
    "mailto:a@example.com",
    "tel:+15551234",
    "sms:+15551234",
  ])("accepts the allowed-scheme href %s", (href) => {
    expect(sanitizeHref(href)).toBe(href);
  });

  test.each(["/about", "#main", "?page=2", "./a", "../a"])(
    "accepts the relative ref %s",
    (href) => {
      expect(sanitizeHref(href)).toBe(href);
    },
  );

  test("returns the href trimmed", () => {
    expect(sanitizeHref("  /about ")).toBe("/about");
  });

  test.each(
    [...BLOCKED_SCHEMES].flatMap((scheme) => [
      `${scheme}:x`,
      `${scheme.toUpperCase()}:x`,
      `  ${scheme}:x`,
      `${scheme.slice(0, 2)}\t${scheme.slice(2)}:x`,
    ]),
  )("rejects the blocked-scheme href %j", (href) => {
    expect(sanitizeHref(href)).toBeUndefined();
  });

  test.each(["ftp://example.com", "", "   ", 42, null])(
    "rejects %j",
    (href) => {
      expect(sanitizeHref(href)).toBeUndefined();
    },
  );
});

describe("linkHrefPattern", () => {
  test.each([...BLOCKED_SCHEMES])(
    "refuses the blocked scheme %s even when the allow-list names it",
    (scheme) => {
      const pattern = linkHrefPattern(["https", scheme]);
      expect(pattern.test(`${scheme}:x`)).toBe(false);
      expect(pattern.test(`${scheme.toUpperCase()}:x`)).toBe(false);
      expect(pattern.test("https://example.com")).toBe(true);
    },
  );
});
