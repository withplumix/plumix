import { describe, expect, it } from "vitest";

import * as db from "./public.js";

// The `@plumix/core/db` surface is the promise that a direct-write / ingest
// plugin never needs its own `drizzle-orm` dependency. Assert the toolkit stays
// whole so a refactor can't silently drop part of it (the drift #1700 is about).
describe("@plumix/core/db surface", () => {
  it("re-exports the drizzle write toolkit and CDN purge vocabulary", () => {
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

  // A direct writer says what it changed with `recordWrite`, and core spells
  // the tags, so no tag minter or raw purge is reachable here (ADR 0042).
  it("hands a direct writer no way to spell or purge a tag", () => {
    for (const name of [
      "typeTag",
      "entryTag",
      "entryPurgeTags",
      "termPurgeTags",
      "enqueuePurgeTags",
      "flushPurgeTags",
      "pageTags",
    ]) {
      expect(db).not.toHaveProperty(name);
    }
  });
});
