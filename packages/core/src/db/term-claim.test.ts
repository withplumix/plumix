import { describe, expect, test } from "vitest";

import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { ConflictError } from "./concurrency.js";
import { eq } from "./index.js";
import { terms } from "./schema/terms.js";
import { assertTermCopyCurrent, claimTerm } from "./term-claim.js";

describe("claimTerm", () => {
  test("a claim from a copy another write overtook writes nothing and names the current token", async () => {
    const db = await createTestDb();
    const read = await factoriesFor(db).term.create({ name: "Read" });
    await db
      .update(terms)
      .set({ name: "Saved meanwhile" })
      .where(eq(terms.id, read.id));

    const claimed = claimTerm(db, read.id, read.version, { name: "Mine" });

    await expect(claimed).rejects.toBeInstanceOf(ConflictError);
    await expect(claimed).rejects.toMatchObject({
      etag: String(read.version + 1),
      resource: { kind: "term", id: read.id },
    });
    const [row] = await db
      .select({ name: terms.name })
      .from(terms)
      .where(eq(terms.id, read.id));
    expect(row?.name).toBe("Saved meanwhile");
  });

  test("a claim from the current copy lands and moves the version by one", async () => {
    const db = await createTestDb();
    const read = await factoriesFor(db).term.create({ name: "Read" });

    const claimed = await claimTerm(db, read.id, read.version, {
      name: "Mine",
    });

    expect(claimed).toMatchObject({ name: "Mine", version: read.version + 1 });
  });

  test("a claim on a term that is gone answers undefined", async () => {
    const db = await createTestDb();

    expect(await claimTerm(db, 9999, 0, { name: "Mine" })).toBeUndefined();
  });
});

describe("assertTermCopyCurrent", () => {
  test("a copy holding the term's version passes", () => {
    expect(() => {
      assertTermCopyCurrent(3, { id: 7, version: 3 });
    }).not.toThrow();
  });

  test("a stale copy is refused with the current token and the term it guards", () => {
    expect(() => {
      assertTermCopyCurrent(2, { id: 7, version: 3 });
    }).toThrow(
      expect.objectContaining({
        etag: "3",
        resource: { kind: "term", id: 7 },
      }),
    );
  });
});
