import { describe, expect, test } from "vitest";

import { entryTag, hydratedEntityTags, userTag } from "./tags.js";

describe("hydratedEntityTags", () => {
  test("an entry id tags the page with the entry's tag", () => {
    expect(hydratedEntityTags("entry", "9")).toEqual([entryTag(9)]);
  });

  test("a user id tags the page with the user's tag", () => {
    expect(hydratedEntityTags("user", "4")).toEqual([userTag(4)]);
  });

  test("a term id adds no tag", () => {
    expect(hydratedEntityTags("term", "3")).toEqual([]);
  });
});
