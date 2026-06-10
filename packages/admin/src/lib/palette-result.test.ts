import { describe, expect, test } from "vitest";

import { resultHref, shouldOpenInNewTab } from "./palette-result.js";

const slug = (name: string): string => (name === "post" ? "posts" : name);

describe("resultHref", () => {
  test("builds an entry editor URL using the resolved admin slug", () => {
    expect(resultHref("entry:post", "1", slug)).toBe(
      "/_plumix/admin/entries/posts/1/edit",
    );
  });

  test("builds a term editor URL", () => {
    expect(resultHref("term:category", "7", slug)).toBe(
      "/_plumix/admin/terms/category/7/edit",
    );
  });

  test("builds a user editor URL", () => {
    expect(resultHref("users", "9", slug)).toBe("/_plumix/admin/users/9/edit");
  });

  test("returns null for an unknown domain", () => {
    expect(resultHref("widget:thing", "1", slug)).toBeNull();
  });
});

describe("shouldOpenInNewTab", () => {
  test("true when meta or ctrl is held", () => {
    expect(shouldOpenInNewTab({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(shouldOpenInNewTab({ metaKey: false, ctrlKey: true })).toBe(true);
  });

  test("false otherwise", () => {
    expect(shouldOpenInNewTab({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});
