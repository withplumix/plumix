import { describe, expect, test } from "vitest";

import { basePathFromBaseHref } from "./admin-base.js";

describe("basePathFromBaseHref", () => {
  test("no <base> tag → root deployment", () => {
    expect(basePathFromBaseHref(null)).toBe("");
  });

  test("root mount → empty base path", () => {
    expect(basePathFromBaseHref("/_plumix/admin/")).toBe("");
  });

  test("subdirectory mount → the subdirectory prefix", () => {
    expect(basePathFromBaseHref("/custom-directory/_plumix/admin/")).toBe(
      "/custom-directory",
    );
  });

  test("nested subdirectory mount", () => {
    expect(basePathFromBaseHref("/a/b/_plumix/admin/")).toBe("/a/b");
  });
});
