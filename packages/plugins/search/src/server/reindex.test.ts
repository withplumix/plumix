import type { AppContext } from "plumix/plugin";
import { sql } from "plumix/db";
import { factoriesFor } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import { createSearchContext, indexedSourceIds } from "../test/db.js";
import { advanceReindex, latestReindex, startReindex } from "./reindex.js";

let db: SearchTestDb;
let ctx: AppContext;
let authorId: number;

beforeEach(async () => {
  ({ db, ctx, authorId } = await createSearchContext());
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

/** Advance until the run reaches a final status, or give up. */
async function runToCompletion(chunk: number): Promise<number> {
  for (let invocations = 1; invocations <= 50; invocations += 1) {
    await advanceReindex(ctx, chunk);
    if ((await latestReindex(ctx))?.status !== "running") return invocations;
  }
  throw new Error("reindex never finished");
}

describe("reindex", () => {
  test("rebuilds the whole index across several invocations", async () => {
    const ids = await publish(5);
    await startReindex(ctx);

    const invocations = await runToCompletion(2);

    expect(invocations).toBeGreaterThan(1);
    expect(await indexedSourceIds(db, "hydroponics")).toEqual([...ids]);
    expect(await latestReindex(ctx)).toMatchObject({
      status: "succeeded",
      processed: 5,
      failed: 0,
    });
  });

  test("reports how far it has got while it is still going", async () => {
    await publish(5);
    await startReindex(ctx);

    await advanceReindex(ctx, 2);

    expect(await latestReindex(ctx)).toMatchObject({
      status: "running",
      processed: 2,
    });
  });

  test("resumes where it stopped rather than starting again", async () => {
    const ids = await publish(4);
    await startReindex(ctx);
    await advanceReindex(ctx, 2);

    // Whatever the first two were, the next chunk must not be them.
    expect(await indexedSourceIds(db, "hydroponics")).toEqual(ids.slice(0, 2));

    await advanceReindex(ctx, 2);

    expect(await latestReindex(ctx)).toMatchObject({ processed: 4 });
    expect(await indexedSourceIds(db, "hydroponics")).toEqual([...ids]);
  });

  test("walks terms once it has finished the entries", async () => {
    const entries = await publish(2);
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Hydroponics",
      slug: "hydroponics",
    });
    await startReindex(ctx);

    await runToCompletion(2);

    expect(await indexedSourceIds(db, "hydroponics")).toEqual(
      [...entries, term.id].sort((a, b) => a - b),
    );
    expect(await latestReindex(ctx)).toMatchObject({ processed: 3 });
  });

  test("leaves the index searchable throughout", async () => {
    const ids = await publish(4);
    // Everything already indexed, as it would be on a live site.
    await startReindex(ctx);
    await runToCompletion(4);
    await startReindex(ctx);

    await advanceReindex(ctx, 1);

    // Mid-rebuild, and the documents the run has not reached are still there.
    expect(await indexedSourceIds(db, "hydroponics")).toEqual([...ids]);
    expect(await latestReindex(ctx)).toMatchObject({ status: "running" });
  });

  test("starting a run while one is going carries on with it", async () => {
    await publish(4);
    const first = await startReindex(ctx);
    await advanceReindex(ctx, 2);

    const second = await startReindex(ctx);

    expect(second.id).toBe(first.id);
    expect(second.processed).toBe(2);
  });

  test("a finished run leaves the next one free to start", async () => {
    await publish(1);
    const first = await startReindex(ctx);
    await runToCompletion(10);

    const second = await startReindex(ctx);

    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ status: "running", processed: 0 });
  });

  test("advancing with nothing to do is not an error", async () => {
    await expect(advanceReindex(ctx, 10)).resolves.toBe(0);
    expect(await latestReindex(ctx)).toBeNull();
  });
});
