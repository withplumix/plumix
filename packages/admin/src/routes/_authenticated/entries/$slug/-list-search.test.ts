import { describe, expect, test } from "vitest";

import { ENTRY_LIST_ORDER_COLUMNS } from "@plumix/core/manifest";

import {
  entriesListSearchSchema,
  STATUS_FILTER_VALUES,
} from "./-list-search.js";

describe("entriesListSearchSchema", () => {
  test("offers exactly core's order columns", () => {
    const offered = entriesListSearchSchema.entries.orderBy.wrapped.options;

    expect(offered).toEqual([...ENTRY_LIST_ORDER_COLUMNS]);
  });
});

describe("STATUS_FILTER_VALUES", () => {
  test("offers All, then Published, then core's other statuses", () => {
    expect(STATUS_FILTER_VALUES).toEqual([
      "all",
      "published",
      "draft",
      "scheduled",
      "trash",
    ]);
  });
});
