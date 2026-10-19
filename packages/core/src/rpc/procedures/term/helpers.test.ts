import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { factoriesFor } from "../../../test/factories.js";
import { createTestDb } from "../../../test/harness.js";
import { writeTermAsSystem } from "./helpers.js";

describe("writeTermAsSystem", () => {
  test("a write that lost a race re-reads the term and decides again", async () => {
    const db = await createTestDb();
    const read = await factoriesFor(db).term.create({ name: "Read" });
    await db
      .update(terms)
      .set({ name: "Moved since", version: read.version + 1 })
      .where(eq(terms.id, read.id));
    const seen: string[] = [];

    const written = await writeTermAsSystem(db, read, (row) => {
      seen.push(row.name);
      return { description: "system" };
    });

    expect(seen).toEqual(["Read", "Moved since"]);
    expect(written).toMatchObject({
      name: "Moved since",
      description: "system",
      version: read.version + 2,
    });
  });

  test("a decision to leave the term writes nothing and keeps its token", async () => {
    const db = await createTestDb();
    const read = await factoriesFor(db).term.create();

    const written = await writeTermAsSystem(db, read, () => undefined);

    expect(written?.version).toBe(read.version);
    const [row] = await db
      .select({ version: terms.version })
      .from(terms)
      .where(eq(terms.id, read.id));
    expect(row?.version).toBe(read.version);
  });
});
