import { describe, expect, test } from "vitest";

import type { HtmlAllowlist } from "./sanitize.js";
import {
  enforceHtmlFloors,
  HARD_DENIED_ATTRS,
  HARD_DENIED_SCHEMES,
  HARD_DENYLIST,
} from "./floors.js";

function floor(allowlist: Partial<HtmlAllowlist>): HtmlAllowlist {
  return enforceHtmlFloors({
    allowedTags: ["p"],
    allowedAttributes: {},
    allowedSchemes: ["https"],
    ...allowlist,
  });
}

describe("enforceHtmlFloors", () => {
  // The suites below derive their cases from these rosters, so a member
  // deleted from a roster would take its coverage with it silently.
  test("the rosters are what they say they are", () => {
    expect([...HARD_DENIED_ATTRS]).toEqual(["style"]);
    expect([...HARD_DENIED_SCHEMES]).toEqual([
      "javascript",
      "vbscript",
      "data",
      "blob",
      "view-source",
    ]);
  });

  test.each([...HARD_DENYLIST])("drops the denied tag `%s`", (tag) => {
    expect(floor({ allowedTags: ["p", tag] }).allowedTags).toEqual(["p"]);
  });

  // Neither engine sees a name the floor did not canonicalize: sanitize-html
  // lowercases the parsed tag and matches the list verbatim, DOMPurify
  // lowercases its list — so a mixed-case entry renders in the editor alone.
  test.each([...HARD_DENYLIST].map((tag) => tag.toUpperCase()))(
    "drops the denied tag `%s` however it is spelled",
    (tag) => {
      expect(floor({ allowedTags: ["p", tag] }).allowedTags).toEqual(["p"]);
    },
  );

  test.each([...HARD_DENIED_ATTRS])(
    "drops the denied attribute `%s`",
    (attr) => {
      expect(
        floor({ allowedAttributes: { p: [attr] } }).allowedAttributes.p,
      ).toEqual([]);
    },
  );

  test.each(["onclick", "onerror", "onmouseover", "ONCLICK", "OnFocus"])(
    "drops the handler `%s`",
    (attr) => {
      expect(
        floor({ allowedAttributes: { p: [attr] } }).allowedAttributes.p,
      ).toEqual([]);
    },
  );

  // sanitize-html reads an attribute entry as a glob and a `*` key as every
  // tag; the shim expands neither, so a glob is a hole and a divergence both.
  test.each(["*", "o*", "*click", "st*", "xlink:onclick", "data-x onclick"])(
    "drops the non-literal attribute name `%s`",
    (attr) => {
      expect(
        floor({ allowedAttributes: { p: [attr] } }).allowedAttributes.p,
      ).toEqual([]);
    },
  );

  test.each(["*", "sc ript", "xlink:svg"])(
    "drops the non-literal tag name `%s`",
    (tag) => {
      expect(floor({ allowedTags: ["p", tag] }).allowedTags).toEqual(["p"]);
    },
  );

  test("drops a `*` tag key outright", () => {
    expect(
      floor({ allowedAttributes: { "*": ["title"] } }).allowedAttributes,
    ).toEqual({});
  });

  test("drops attributes hung on a denied tag", () => {
    expect(
      floor({ allowedAttributes: { iframe: ["src"] } }).allowedAttributes,
    ).toEqual({});
  });

  test.each([...HARD_DENIED_SCHEMES])(
    "drops the denied scheme `%s`",
    (scheme) => {
      expect(
        floor({ allowedSchemes: ["https", scheme] }).allowedSchemes,
      ).toEqual(["https"]);
    },
  );

  test.each([...HARD_DENIED_SCHEMES].map((s) => s.toUpperCase()))(
    "drops the denied scheme `%s` however it is spelled",
    (scheme) => {
      expect(floor({ allowedSchemes: [scheme] }).allowedSchemes).toEqual([]);
    },
  );

  test("canonicalizes what survives", () => {
    const out = floor({
      allowedTags: ["P", "p", "EM"],
      allowedAttributes: { A: ["HREF", "href"] },
      allowedSchemes: ["HTTPS", "https"],
    });
    expect(out.allowedTags).toEqual(["p", "em"]);
    expect(out.allowedAttributes.a).toEqual(["href"]);
    expect(out.allowedSchemes).toEqual(["https"]);
  });

  test("leaves an already-clean allowlist alone, and is idempotent", () => {
    const clean = floor({
      allowedTags: ["p", "em"],
      allowedAttributes: { a: ["href"] },
    });
    expect(enforceHtmlFloors(clean)).toEqual(clean);
  });

  test("an absent scheme list stays absent rather than becoming empty", () => {
    const out = enforceHtmlFloors({
      allowedTags: ["p"],
      allowedAttributes: {},
    });
    expect(out.allowedSchemes).toBeUndefined();
  });
});
