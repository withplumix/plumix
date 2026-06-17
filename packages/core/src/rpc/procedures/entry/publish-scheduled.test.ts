import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { AppContext } from "../../../context/app.js";
import { entries } from "../../../db/schema/entries.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { entryFactory, userFactory } from "../../../test/factories.js";
import { createTestDb } from "../../../test/harness.js";
import { publishDueScheduledEntries } from "./publish-scheduled.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function setup() {
  const db = await createTestDb();
  const user = await userFactory.transient({ db }).create({ role: "admin" });
  const hooks = new HookRegistry();
  const published: number[] = [];
  hooks.addAction("entry:published", (entry: { id: number }) => {
    published.push(entry.id);
  });
  const ctx = { db, hooks, logger: silentLogger } as unknown as AppContext;
  return { db, user, hooks, published, ctx };
}

async function statusOf(
  db: Awaited<ReturnType<typeof createTestDb>>,
  id: number,
): Promise<string | undefined> {
  const [row] = await db
    .select({ status: entries.status })
    .from(entries)
    .where(eq(entries.id, id));
  return row?.status;
}

describe("publishDueScheduledEntries", () => {
  it("publishes only scheduled entries whose publishedAt has passed, firing entry:published", async () => {
    const { db, user, published, ctx } = await setup();
    const due = await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() - 1000),
    });
    const notYet = await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() + 60_000),
    });

    const count = await publishDueScheduledEntries(ctx);

    expect(count).toBe(1);
    expect(await statusOf(db, due.id)).toBe("published");
    expect(await statusOf(db, notYet.id)).toBe("scheduled");
    expect(published).toEqual([due.id]);
  });

  it("does nothing when no scheduled entry is due", async () => {
    const { db, user, published, ctx } = await setup();
    await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() + 60_000),
    });

    const count = await publishDueScheduledEntries(ctx);

    expect(count).toBe(0);
    expect(published).toEqual([]);
  });
});
