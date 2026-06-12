import { describe, expect, test } from "vitest";

import { createCommentsTestDb, ctxFor, seedPublishedPost } from "../test/db.js";
import { commentFactory } from "../test/factories.js";
import { checkRateLimit, isHoneypotTripped } from "./spam.js";

describe("isHoneypotTripped", () => {
  test("untripped for empty, whitespace, null, or undefined", () => {
    expect(isHoneypotTripped(undefined)).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
  });

  test("tripped when a bot fills the hidden field", () => {
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
  });
});

describe("checkRateLimit", () => {
  const limit = { max: 3, windowMin: 10 };

  test("allows submissions below the window limit", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    await seed.create({ entryId: entry.id, ipHash: "ip-a" });
    await seed.create({ entryId: entry.id, ipHash: "ip-a" });

    expect(await checkRateLimit(ctxFor(db), "ip-a", limit)).toBe(false);
  });

  test("blocks once the window limit is reached", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    for (let i = 0; i < 3; i++) {
      await seed.create({ entryId: entry.id, ipHash: "ip-b" });
    }

    expect(await checkRateLimit(ctxFor(db), "ip-b", limit)).toBe(true);
  });

  test("counts only the same ip hash", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    for (let i = 0; i < 3; i++) {
      await seed.create({ entryId: entry.id, ipHash: "other" });
    }

    expect(await checkRateLimit(ctxFor(db), "ip-c", limit)).toBe(false);
  });

  test("ignores comments older than the window", async () => {
    const db = await createCommentsTestDb();
    const entry = await seedPublishedPost(db);
    const seed = commentFactory.transient({ db });
    const old = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    for (let i = 0; i < 5; i++) {
      await seed.create({ entryId: entry.id, ipHash: "ip-d", createdAt: old });
    }

    expect(await checkRateLimit(ctxFor(db), "ip-d", limit)).toBe(false);
  });
});
