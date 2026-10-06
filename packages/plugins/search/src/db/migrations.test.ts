import { sql } from "plumix/db";
import { describe, expect, test } from "vitest";

import { createSearchTestDb } from "../test/db.js";

describe("search's migration history", () => {
  test("creates the projection, its FTS index and the triggers that feed it", async () => {
    const db = await createSearchTestDb();

    expect(
      await db.all(
        sql`SELECT type, name FROM sqlite_master WHERE name LIKE 'search_%' AND type IN ('table', 'trigger') AND name NOT LIKE 'search_index_%' ORDER BY type, name`,
      ),
    ).toEqual([
      { type: "table", name: "search_documents" },
      { type: "table", name: "search_index" },
      { type: "table", name: "search_reindex_runs" },
      { type: "trigger", name: "search_documents_ad" },
      { type: "trigger", name: "search_documents_ai" },
      { type: "trigger", name: "search_documents_au" },
    ]);
  });
});
