import { describe, expect, test } from "vitest";

import { ENTRY_LIST_ORDER_COLUMNS } from "@plumix/core/manifest";

import { entriesListSearchSchema } from "./-list-search.js";

describe("entriesListSearchSchema", () => {
  test("offers exactly core's order columns", () => {
    const offered = entriesListSearchSchema.entries.orderBy.wrapped.options;

    expect(offered).toEqual([...ENTRY_LIST_ORDER_COLUMNS]);
  });
});
