import { describe, expect, test } from "vitest";

import { lookupSearchInput } from "./lookup-search-input.js";

describe("lookupSearchInput", () => {
  test("a search sends its kind, scope and page size", () => {
    expect(
      lookupSearchInput({
        kind: "user",
        scope: { roles: ["admin"] },
        query: "",
      }),
    ).toEqual({
      kind: "user",
      scope: { roles: ["admin"] },
      query: undefined,
      limit: 20,
    });
  });

  test("the query is trimmed", () => {
    expect(lookupSearchInput({ kind: "entry", query: "  hello  " }).query).toBe(
      "hello",
    );
  });

  test("a blank query sends no query", () => {
    expect(
      lookupSearchInput({ kind: "entry", query: "   " }).query,
    ).toBeUndefined();
  });
});
