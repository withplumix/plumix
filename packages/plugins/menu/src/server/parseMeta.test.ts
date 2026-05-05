import { describe, expect, test } from "vitest";

import { parseMenuItemMeta } from "./parseMeta.js";

describe("parseMenuItemMeta", () => {
  test("custom kind requires a string url", () => {
    expect(parseMenuItemMeta({ kind: "custom", url: "/about" })).toEqual({
      kind: "custom",
      url: "/about",
    });
    expect(parseMenuItemMeta({ kind: "custom", url: 42 })).toBeNull();
    expect(parseMenuItemMeta({ kind: "custom" })).toBeNull();
  });

  test("entry kind requires a finite numeric entryId", () => {
    expect(parseMenuItemMeta({ kind: "entry", entryId: 7 })).toEqual({
      kind: "entry",
      entryId: 7,
    });
    expect(parseMenuItemMeta({ kind: "entry", entryId: "7" })).toBeNull();
    expect(parseMenuItemMeta({ kind: "entry", entryId: NaN })).toBeNull();
    expect(parseMenuItemMeta({ kind: "entry" })).toBeNull();
  });

  test("term kind requires a finite numeric termId", () => {
    expect(parseMenuItemMeta({ kind: "term", termId: 3 })).toEqual({
      kind: "term",
      termId: 3,
    });
    expect(parseMenuItemMeta({ kind: "term" })).toBeNull();
  });

  test("rejects unknown kinds and bad shapes", () => {
    expect(parseMenuItemMeta(null)).toBeNull();
    expect(parseMenuItemMeta(undefined)).toBeNull();
    expect(parseMenuItemMeta("custom")).toBeNull();
    expect(parseMenuItemMeta({ kind: "synthetic" })).toBeNull();
    expect(parseMenuItemMeta({})).toBeNull();
  });

  test("preserves recognized display attrs only", () => {
    const meta = parseMenuItemMeta({
      kind: "custom",
      url: "/x",
      target: "_blank",
      rel: "noopener",
      cssClasses: ["a", "b", 0, ""],
      somethingElse: "ignored",
    });
    expect(meta).toEqual({
      kind: "custom",
      url: "/x",
      target: "_blank",
      rel: "noopener",
      cssClasses: ["a", "b"],
    });
  });

  test("drops invalid display attrs without rejecting the whole item", () => {
    const meta = parseMenuItemMeta({
      kind: "custom",
      url: "/x",
      target: "_top",
      rel: 7,
      cssClasses: "string-not-array",
    });
    expect(meta).toEqual({ kind: "custom", url: "/x" });
  });
});
