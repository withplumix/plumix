import type { AppContext, MutablePluginRegistry } from "plumix/plugin";
import { eq, sql } from "plumix/db";
import { text } from "plumix/fields";
import { entries } from "plumix/schema";
import { factoriesFor } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import {
  createSearchContext,
  indexedSourceIds,
  watchRewrites,
} from "../test/db.js";
import { repairStaleEntries } from "./drain.js";
import { currentExtractorVersion } from "./index-writer.js";
import { advanceReindex, startReindex } from "./reindex.js";

let db: SearchTestDb;
let ctx: AppContext;
let plugins: MutablePluginRegistry;
let authorId: number;

beforeEach(async () => {
  ({ db, ctx, plugins, authorId } = await createSearchContext());
});

/**
 * Publish `count` entries, none of them indexed, and clear the change feed.
 *
 * The feed is what a live site's drain has already emptied; leaving rows on it
 * would mean these entries are owed to the drain, which the rebuild walk
 * deliberately steps over. What is left is the state a rebuild exists for:
 * sources whose documents are missing or wrong, with nothing pending.
 */
async function publish(count: number): Promise<readonly number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const entry = await factoriesFor(db).entry.create({
      authorId,
      status: "published",
      publishedAt: new Date(),
      title: `Hydroponics ${String(i)}`,
      slug: `s${String(i)}`,
    });
    ids.push(entry.id);
  }
  await db.run(sql`DELETE FROM entry_changes`);
  return ids;
}

/** One full pass, for a corpus small enough to finish in a single chunk. */
async function advanceOnce(): Promise<void> {
  await startReindex(ctx);
  await advanceReindex(ctx, 100);
}

describe("repairStaleEntries", () => {
  /** Age every document, the way an older roster would have left them. */
  async function age(): Promise<void> {
    await db.run(
      sql`UPDATE search_documents SET extractor_version = 'an-older-roster'`,
    );
  }

  test("re-extracts what an older roster left behind", async () => {
    const [id] = await publish(1);
    await advanceOnce();
    await age();

    const repaired = await repairStaleEntries(
      ctx,
      currentExtractorVersion(ctx),
      10,
    );

    expect(repaired).toBe(1);
    expect(await indexedSourceIds(db, "hydroponics")).toEqual([id]);
  });

  test("marking a field searchable re-indexes the entries it affects", async () => {
    const entry = await factoriesFor(db).entry.create({
      authorId,
      status: "published",
      publishedAt: new Date(),
      title: "Winter growing",
      slug: "winter-growing",
      meta: { subtitle: "Aquaponics without a greenhouse" },
    });
    await db.run(sql`DELETE FROM entry_changes`);
    await advanceOnce();
    expect(await indexedSourceIds(db, "aquaponics")).toEqual([]);

    // What a site does when it wants an existing field indexed. Nothing else
    // changes: no version is bumped by hand, and no entry is re-saved.
    plugins.entryMetaBoxes.set("extras", {
      id: "extras",
      registeredBy: "test",
      label: "Extras",
      entryTypes: ["post"],
      fields: [text("subtitle").searchable().build()],
    });
    await repairStaleEntries(ctx, currentExtractorVersion(ctx), 10);

    expect(await indexedSourceIds(db, "aquaponics")).toEqual([entry.id]);
  });

  test("stops offering a document it has already brought up to date", async () => {
    await publish(2);
    await advanceOnce();
    await age();
    const version = currentExtractorVersion(ctx);

    expect(await repairStaleEntries(ctx, version, 10)).toBe(2);
    expect(await repairStaleEntries(ctx, version, 10)).toBe(0);
  });

  test("re-tokenizes only the entries whose text actually moved", async () => {
    // The roster hash is one number over every block, so a declaration change
    // makes every document stale at once — but only the ones whose extracted
    // text differs should cost the index a rewrite.
    const moved = await factoriesFor(db).entry.create({
      authorId,
      status: "published",
      publishedAt: new Date(),
      title: "Hydroponics one",
      slug: "moved",
    });
    const still = await factoriesFor(db).entry.create({
      authorId,
      status: "published",
      publishedAt: new Date(),
      title: "Hydroponics two",
      slug: "still",
    });
    // Nothing pending, so the rebuild walk will take them rather than leave
    // them to the drain.
    await db.run(sql`DELETE FROM entry_changes`);
    await advanceOnce();
    await age();
    await db
      .update(entries)
      .set({ title: "Rewritten entirely" })
      .where(eq(entries.id, moved.id));

    const rewrites = await watchRewrites(db);
    await repairStaleEntries(ctx, currentExtractorVersion(ctx), 10);

    expect(await rewrites()).toEqual([moved.id]);
    // Both are current now, so the repair has drained — the one whose text
    // never moved was stamped rather than rewritten.
    expect(
      await repairStaleEntries(ctx, currentExtractorVersion(ctx), 10),
    ).toBe(0);
    expect(await indexedSourceIds(db, "hydroponics")).toEqual([still.id]);
    expect(await indexedSourceIds(db, "rewritten")).toEqual([moved.id]);
  });
});
