import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { entries } from "../../../db/schema/entries.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { createTestContext } from "../../../test/context.js";
import { entryFactory, userFactory } from "../../../test/factories.js";
import { createTestDb } from "../../../test/harness.js";
import { publishDueScheduledEntries } from "./publish-scheduled.js";

async function setup() {
  const db = await createTestDb();
  const user = await userFactory.transient({ db }).create({ role: "admin" });
  const hooks = new HookRegistry();
  const published: number[] = [];
  hooks.addAction("entry:published", (entry: { id: number }) => {
    published.push(entry.id);
  });
  const ctx = createTestContext({ db, hooks });
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("publishes an entry due at the very second the run starts", async () => {
    const { db, user, ctx } = await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2100-01-01T00:00:00Z"));
    const due = await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date("2100-01-01T00:00:00Z"),
    });

    const count = await publishDueScheduledEntries(ctx);

    expect(count).toBe(1);
    expect(await statusOf(db, due.id)).toBe("published");
  });

  it("leaves an entry an editor published after the run read it", async () => {
    const { db, user, hooks, published, ctx } = await setup();
    const first = await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() - 2000),
    });
    const second = await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() - 1000),
    });
    hooks.addAction("entry:published", async () => {
      await db
        .update(entries)
        .set({ status: "published" })
        .where(eq(entries.id, second.id));
    });

    const count = await publishDueScheduledEntries(ctx);

    expect(count).toBe(1);
    expect(published).toEqual([first.id]);
  });

  it("leaves an entry an editor rescheduled after the run read it", async () => {
    const { db, user, hooks, ctx } = await setup();
    await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() - 2000),
    });
    const second = await entryFactory.transient({ db }).create({
      authorId: user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() - 1000),
    });
    hooks.addAction("entry:published", async () => {
      await db
        .update(entries)
        .set({ publishedAt: new Date(Date.now() + 60_000) })
        .where(eq(entries.id, second.id));
    });

    const count = await publishDueScheduledEntries(ctx);

    expect(count).toBe(1);
    expect(await statusOf(db, second.id)).toBe("scheduled");
  });
});
