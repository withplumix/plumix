import { describe, expect, test } from "vitest";

import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { deriveUserSlug } from "./slug.js";

describe("deriveUserSlug", () => {
  test("slugifies the name", async () => {
    const db = await createTestDb();
    expect(await deriveUserSlug(db, "Jane Doe")).toBe("jane-doe");
  });

  test("falls back to `user` when the name yields no slug", async () => {
    const db = await createTestDb();
    expect(await deriveUserSlug(db, null)).toBe("user");
    expect(await deriveUserSlug(db, "   ")).toBe("user");
    // CJK transliterates to empty (see slugify's doc comment).
    expect(await deriveUserSlug(db, "日本語")).toBe("user");
  });

  test("keeps the bare base when it is free", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    await f.user.create({ name: "Ada", slug: "someone-else" });
    expect(await deriveUserSlug(db, "Ada")).toBe("ada");
  });

  test("appends the smallest free numeric suffix on collision", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    await f.user.create({ name: "John", slug: "john" });
    expect(await deriveUserSlug(db, "John")).toBe("john-1");
    await f.user.create({ name: "John", slug: "john-1" });
    expect(await deriveUserSlug(db, "John")).toBe("john-2");
  });

  test("numbers the fallback base for anonymous users", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    await f.user.create({ slug: "user" });
    expect(await deriveUserSlug(db, null)).toBe("user-1");
  });

  test("does not treat a different-name slug as a numeric collision", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    // `john-doe` matches a `john-%` prefix scan but is not a `john-<n>` taken slug.
    await f.user.create({ name: "John Doe", slug: "john-doe" });
    expect(await deriveUserSlug(db, "John")).toBe("john");
  });
});
