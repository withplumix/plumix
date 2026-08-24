import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../index.js";
import { buildHtmlAllowlist } from "./build-allowlist.js";
import { sanitizeHtml } from "./sanitize.js";

const EMPTY_BLOCK_REGISTRY = createBlockRegistry([]);

describe("buildHtmlAllowlist", () => {
  test("baseline contains the standard formatting tags", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY);
    expect(allowlist.allowedTags).toContain("p");
    expect(allowlist.allowedTags).toContain("strong");
    expect(allowlist.allowedTags).toContain("em");
  });

  test("operator extraTags is additive on top of the baseline", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      extraTags: ["section", "article"],
    });
    expect(allowlist.allowedTags).toContain("section");
    expect(allowlist.allowedTags).toContain("article");
    expect(allowlist.allowedTags).toContain("p");
  });

  test("operator extraAttributes merges per-tag attrs without losing baseline", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      extraAttributes: { a: ["rel"] },
    });
    expect(allowlist.allowedAttributes.a).toContain("href");
    expect(allowlist.allowedAttributes.a).toContain("rel");
  });

  test("override schemes wins over baseline", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      schemes: ["https"],
    });
    expect(allowlist.allowedSchemes).toEqual(["https"]);
  });

  test("explicit `schemes: []` locks down rather than falling back to baseline", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      schemes: [],
    });
    expect(allowlist.allowedSchemes).toEqual([]);
  });

  // Anchors the roster the two suites below iterate: without this,
  // dropping a member takes its cases with it and stays green.
  test("override schemes are lowercased so both sanitizers agree on them", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      schemes: ["HTTPS"],
    });
    expect(allowlist.allowedSchemes).toEqual(["https"]);
  });

  test("an override admitting `javascript:` cannot produce a live href", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      schemes: ["https", "javascript"],
    });
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>', allowlist);
    expect(out).toBe("<a>x</a>");
  });

  test("the attribute floor does not disturb the legitimate names beside it", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      extraAttributes: { a: ["REL", "onclick", "target"] },
    });
    expect(allowlist.allowedAttributes.a).toEqual([
      "href",
      "title",
      "rel",
      "target",
    ]);
  });

  test.each([
    ["*", '<p onclick="alert(1)" style="color:red">x</p>'],
    ["o*", '<p onclick="alert(1)">x</p>'],
    ["*click", '<p onclick="alert(1)">x</p>'],
  ])("a `%s` glob cannot survive into the rendered output", (attr, markup) => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      extraAttributes: { p: [attr] },
    });
    expect(sanitizeHtml(markup, allowlist)).toBe("<p>x</p>");
  });

  test("an override granting a handler cannot produce a live one", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      extraAttributes: { p: ["onclick"] },
    });
    const out = sanitizeHtml('<p onclick="alert(1)">x</p>', allowlist);
    expect(out).toBe("<p>x</p>");
  });

  test("registered blocks' parsePaste does NOT widen the output allowlist", () => {
    // parsePaste is for editor INPUT (absorbing pasted HTML into a
    // block); it must not promote tags into core/html's OUTPUT.
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY);
    // The baseline doesn't include `section`; even if a block declared
    // `parsePaste: [{selector: "section"}]` (in a populated registry),
    // that must not surface here.
    expect(allowlist.allowedTags).not.toContain("section");
  });
});
