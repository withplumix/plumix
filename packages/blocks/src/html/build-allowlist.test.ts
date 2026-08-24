import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../index.js";
import {
  buildHtmlAllowlist,
  HARD_DENIED_SCHEMES,
  HARD_DENYLIST,
} from "./build-allowlist.js";
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
  test("the denied scheme roster is what it says it is", () => {
    expect([...HARD_DENIED_SCHEMES]).toEqual([
      "javascript",
      "vbscript",
      "data",
      "blob",
      "view-source",
    ]);
  });

  test.each([...HARD_DENIED_SCHEMES])(
    "hard denylist blocks operator-supplied `%s` in schemes",
    (scheme) => {
      const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
        schemes: ["https", scheme],
      });
      expect(allowlist.allowedSchemes).toEqual(["https"]);
    },
  );

  test.each([...HARD_DENIED_SCHEMES].map((scheme) => scheme.toUpperCase()))(
    "hard denylist blocks the scheme `%s` regardless of the case it is written in",
    (scheme) => {
      const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
        schemes: [scheme],
      });
      expect(allowlist.allowedSchemes).toEqual([]);
    },
  );

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

  test.each([...HARD_DENYLIST])(
    "hard denylist blocks operator-supplied `%s` in extraTags",
    (tag) => {
      const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
        extraTags: [tag],
      });
      expect(allowlist.allowedTags).not.toContain(tag);
    },
  );

  test.each([...HARD_DENYLIST].map((tag) => tag.toUpperCase()))(
    "hard denylist blocks `%s` regardless of the case it is written in",
    (tag) => {
      const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
        extraTags: [tag],
        extraAttributes: { [tag]: ["src"] },
      });
      expect(allowlist.allowedTags).not.toContain(tag);
      expect(allowlist.allowedTags).not.toContain(tag.toLowerCase());
      expect(allowlist.allowedAttributes).not.toHaveProperty(tag);
      expect(allowlist.allowedAttributes).not.toHaveProperty(tag.toLowerCase());
    },
  );

  test("hard denylist also strips extraAttributes targeting dangerous tags", () => {
    const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
      extraAttributes: { iframe: ["src"] },
    });
    expect(allowlist.allowedAttributes).not.toHaveProperty("iframe");
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
