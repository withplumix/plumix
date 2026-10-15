import { describe, expect, test } from "vitest";

import {
  isPaletteSearching,
  resultHref,
  resultRoute,
  shouldOpenInNewTab,
} from "./palette-result.js";

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

describe("resultRoute", () => {
  test("routes an entry result to its editor under the type's admin slug", () => {
    expect(resultRoute("entry:post", "1", slug)).toBe("/entries/posts/1/edit");
  });

  test("routes a term result to its taxonomy's term editor", () => {
    expect(resultRoute("term:category", "7", slug)).toBe(
      "/terms/category/7/edit",
    );
  });

  test("routes a user result to the user editor", () => {
    expect(resultRoute("users", "9", slug)).toBe("/users/9/edit");
  });

  test("encodes the slug, term name and id the way the router encodes a segment", () => {
    expect(resultRoute("entry:a b", "1/2", () => "a b")).toBe(
      "/entries/a%20b/1%2F2/edit",
    );
    expect(resultRoute("term:a/b", "7", slug)).toBe("/terms/a%2Fb/7/edit");
  });

  test("routes nowhere for an unknown domain", () => {
    expect(resultRoute("widget:thing", "1", slug)).toBeNull();
  });
});

describe("isPaletteSearching", () => {
  test("searching while a typed query waits out the debounce", () => {
    expect(isPaletteSearching("hello", "hell", false)).toBe(true);
  });

  test("searching while the debounced query's request is in flight", () => {
    expect(isPaletteSearching("hello", "hello", true)).toBe(true);
  });

  test("not searching once the debounced query's results have landed", () => {
    expect(isPaletteSearching("hello", "hello", false)).toBe(false);
  });

  test("not searching for a query too short to search", () => {
    expect(isPaletteSearching("h", "", false)).toBe(false);
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
