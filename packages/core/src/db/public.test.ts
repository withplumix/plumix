import { describe, expect, it } from "vitest";

import * as db from "./public.js";

// The `@plumix/core/db` surface is the promise that a direct-write / ingest
// plugin never needs its own `drizzle-orm` dependency. Assert the toolkit stays
// whole so a refactor can't silently drop part of it (the drift #1700 is about).
describe("@plumix/core/db surface", () => {
  it("re-exports the drizzle write toolkit and edge-cache purge vocabulary", () => {
    for (const name of [
      "eq",
      "and",
      "inArray",
      "sql",
      "getTableColumns",
      "getTableName",
      "is",
      "entries",
      "typeTag",
      "entryTag",
      "entryPurgeTags",
      "termPurgeTags",
      "enqueuePurgeTags",
    ]) {
      expect(db, name).toHaveProperty(name);
    }
  });

  it("does not leak core-owned purge lifecycle internals", () => {
    for (const name of [
      "flushPurgeTags",
      "registerCorePurgeInvalidator",
      "pageTags",
    ]) {
      expect(db).not.toHaveProperty(name);
    }
  });
});
