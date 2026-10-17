import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { ENTRY_LIST_ORDER_COLUMNS } from "@plumix/core/manifest";

import { entriesListSearchSchema } from "./-list-search.js";

describe("entriesListSearchSchema", () => {
  test.each(ENTRY_LIST_ORDER_COLUMNS)(
    "keeps a sort by core's %s order column",
    (column) => {
      const search = v.parse(entriesListSearchSchema, { orderBy: column });

      expect(search.orderBy).toBe(column);
    },
  );
});
