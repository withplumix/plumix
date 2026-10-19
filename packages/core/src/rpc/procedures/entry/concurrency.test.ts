import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { entryRows } from "./concurrency.js";

describe("writeAsSystem", () => {
  test("a write that lands after the read sends it back to decide from the entry as it is now", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "system-write-bystander",
    });
    const read = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "system-write-retry",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    await h.db
      .update(entries)
      .set({ status: "published" })
      .where(eq(entries.id, read.id));
    const decidedFrom: string[] = [];

    const result = await entryRows(h.db).writeAsSystem(read, (row) => {
      decidedFrom.push(row.status);
      return { status: "trash" };
    });

    expect(decidedFrom).toEqual(["draft", "published"]);
    expect(result).toMatchObject({
      written: true,
      row: { status: "trash", updatedAt: new Date("2100-01-01T00:00:02Z") },
    });
  });

  test("a decision to leave the entry alone writes nothing", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const read = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "system-write-noop",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });

    const result = await entryRows(h.db).writeAsSystem(read, () => undefined);

    expect(result).toMatchObject({ written: false, row: { id: read.id } });
    expect(
      await h.db.query.entries.findFirst({ where: eq(entries.id, read.id) }),
    ).toMatchObject({ updatedAt: new Date("2100-01-01T00:00:00Z") });
  });
});
