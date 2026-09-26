import { describe, expect, test } from "vitest";

import type { EntryTypeOptions } from "./registry.js";
import { applyOverride } from "./override.js";

const DEFAULTS: EntryTypeOptions = {
  label: "Pages",
  labels: { singular: "Page", plural: "Pages" },
  supports: ["title", "editor"],
  isHierarchical: true,
  rewrite: { slug: "" },
  menuIcon: "layout",
};

describe("applyOverride", () => {
  test("an absent override returns the defaults", () => {
    expect(applyOverride(DEFAULTS, undefined)).toBe(DEFAULTS);
  });

  test("an object field merges key by key", () => {
    const out = applyOverride(DEFAULTS, { labels: { singular: "Doc" } });
    expect(out.labels).toEqual({ singular: "Doc", plural: "Pages" });
  });

  test("an array field is replaced", () => {
    const out = applyOverride(DEFAULTS, { supports: ["title"] });
    expect(out.supports).toEqual(["title"]);
  });

  test("a function composes against the default", () => {
    const out = applyOverride(DEFAULTS, {
      supports: (prev) => [...prev, "excerpt"],
    });
    expect(out.supports).toEqual(["title", "editor", "excerpt"]);
  });

  test("a function composes against [] where there is no default", () => {
    const out = applyOverride(DEFAULTS, {
      termTaxonomies: (prev) => [...prev, "topic"],
    });
    expect(out.termTaxonomies).toEqual(["topic"]);
  });

  test("a scalar field is replaced", () => {
    const out = applyOverride(DEFAULTS, {
      isHierarchical: false,
      menuIcon: "file-text",
    });
    expect(out.isHierarchical).toBe(false);
    expect(out.menuIcon).toBe("file-text");
  });

  test("an undefined value leaves the default in place", () => {
    const out = applyOverride(DEFAULTS, {
      rewrite: undefined,
      supports: undefined,
    });
    expect(out).toEqual(DEFAULTS);
  });
});
