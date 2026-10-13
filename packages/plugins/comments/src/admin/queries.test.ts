import { describe, expect, test } from "vitest";

import { queueFilters, queueView } from "./queries.js";

describe("queueFilters", () => {
  test("asks for the search term without the spaces around it", () => {
    expect(queueFilters("  ada ", "").search).toBe("ada");
  });

  test("asks for no search while the box holds only spaces", () => {
    expect(queueFilters("   ", "").search).toBeUndefined();
  });

  test("asks for the entry whose id the filter box holds", () => {
    expect(queueFilters("", "7").entryId).toBe(7);
  });

  test("asks for every entry while the filter box holds no number", () => {
    expect(queueFilters("", "").entryId).toBeUndefined();
  });
});

describe("queueView", () => {
  test("shows the loading state until the queue arrives", () => {
    expect(
      queueView({ isLoading: true, isError: false, data: undefined }),
    ).toBe("loading");
  });

  test("shows the error when the queue failed to load", () => {
    expect(
      queueView({ isLoading: false, isError: true, data: undefined }),
    ).toBe("error");
  });

  test("shows the empty state for a tab with no comments", () => {
    expect(queueView({ isLoading: false, isError: false, data: [] })).toBe(
      "empty",
    );
  });

  test("shows the rows of a tab with comments", () => {
    expect(
      queueView({ isLoading: false, isError: false, data: [{ id: 1 }] }),
    ).toBe("rows");
  });
});
