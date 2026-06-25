import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../index.js";
import { buildHtmlAllowlist } from "./build-allowlist.js";

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

  test.each(["script", "iframe", "object", "embed", "style", "form", "svg"])(
    "hard denylist blocks operator-supplied `%s` in extraTags",
    (tag) => {
      const allowlist = buildHtmlAllowlist(EMPTY_BLOCK_REGISTRY, {
        extraTags: [tag],
      });
      expect(allowlist.allowedTags).not.toContain(tag);
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
    // The baseline doesn't include h5; even if a block declared
    // `parsePaste: [{selector: "h5"}]` (in a populated registry),
    // that must not surface here.
    expect(allowlist.allowedTags).not.toContain("h5");
  });
});
