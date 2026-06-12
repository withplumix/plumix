import { describe, expect, test } from "vitest";

import { createCommentsTestDb, ctxFor } from "../test/db.js";
import { getOrCreateIpSalt } from "./salt.js";

describe("getOrCreateIpSalt", () => {
  test("generates and persists a hex salt on first call", async () => {
    const db = await createCommentsTestDb();
    expect(await getOrCreateIpSalt(ctxFor(db))).toMatch(/^[0-9a-f]{32}$/);
  });

  test("returns the same salt on subsequent calls", async () => {
    const db = await createCommentsTestDb();
    const ctx = ctxFor(db);
    expect(await getOrCreateIpSalt(ctx)).toBe(await getOrCreateIpSalt(ctx));
  });
});
