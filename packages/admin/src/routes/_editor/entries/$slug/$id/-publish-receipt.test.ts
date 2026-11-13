import { describe, expect, test } from "vitest";

import { isPublished } from "./-publish-receipt.js";

describe("isPublished", () => {
  test("a publish that landed reads published while the entry read still says draft", () => {
    expect(isPublished({ status: "draft" }, { status: "published" })).toBe(
      true,
    );
  });

  test("a draft with no publish landed reads unpublished", () => {
    expect(isPublished({ status: "draft" }, null)).toBe(false);
  });

  test("an entry opened already published reads published", () => {
    expect(isPublished({ status: "published" }, null)).toBe(true);
  });
});
