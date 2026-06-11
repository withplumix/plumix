import { describe, expect, test } from "vitest";

import { isCommentingEnabled } from "./enablement.js";

describe("isCommentingEnabled", () => {
  test("enabled when the type is listed in config.entryTypes", () => {
    expect(
      isCommentingEnabled("post", undefined, { entryTypes: ["post"] }),
    ).toBe(true);
  });

  test("enabled when the entry type declares supports: ['comments']", () => {
    expect(isCommentingEnabled("post", ["title", "comments"], {})).toBe(true);
  });

  test("config and supports union — either path enables", () => {
    expect(
      isCommentingEnabled("recipe", ["title"], { entryTypes: ["recipe"] }),
    ).toBe(true);
  });

  test("disabled when neither config nor supports opt in", () => {
    expect(
      isCommentingEnabled("page", ["title", "editor"], {
        entryTypes: ["post"],
      }),
    ).toBe(false);
  });

  test("disabled when supports is undefined and config is empty", () => {
    expect(isCommentingEnabled("page", undefined, {})).toBe(false);
  });
});
