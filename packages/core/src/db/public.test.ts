import { describe, expect, it } from "vitest";

import * as db from "./public.js";

// A direct-write plugin must never need its own `drizzle-orm` dependency, so
// the toolkit has to stay whole.
describe("@plumix/core/db surface", () => {
  it("re-exports the drizzle write toolkit", () => {
    for (const name of [
      "eq",
      "and",
      "or",
      "inArray",
      "isNotNull",
      "exists",
      "count",
      "asc",
      "desc",
      "sql",
      "getTableColumns",
      "getTableName",
      "is",
      "readVisitorMeta",
      "settleMeta",
    ]) {
      expect(db, name).toHaveProperty(name);
    }
  });

  it("leaves the tables to @plumix/core/schema, their one import path", () => {
    expect(db).not.toHaveProperty("entries");
  });

  it("does not leak core-owned cache tags or purge internals", () => {
    for (const name of [
      "typeTag",
      "entryTag",
      "entryPurgeTags",
      "termPurgeTags",
      "enqueuePurgeTags",
      "flushPurgeTags",
      "registerCorePurgeInvalidator",
      "pageTags",
    ]) {
      expect(db).not.toHaveProperty(name);
    }
  });
});
