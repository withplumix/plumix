import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { entry } from "../../src/hooks/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
  },
});

const site = await testSite({ plugins: [posts] });

describe("publishing a draft through an update", () => {
  test("stamps its publish date and emits entry.published and entry.transition once each", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      status: "published",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toEqual(new Date("2026-10-18T12:00:00Z"));
    expect(site.events.emitted(entry.published)).toHaveLength(1);
    expect(site.events.emitted(entry.transition)).toHaveLength(1);
  });

  test("from one copy in three racing saves publishes once and emits entry.published once", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const ifMatch = etagOf(own.updatedAt);
    const rpc = site.actingAs(author).rpc;

    const outcomes = await Promise.allSettled([
      rpc.entry.update({ id: own.id, status: "published", ifMatch }),
      rpc.entry.update({ id: own.id, status: "published", ifMatch }),
      rpc.entry.update({ id: own.id, status: "published", ifMatch }),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      "fulfilled",
      "rejected",
      "rejected",
    ]);
    expect(site.events.emitted(entry.published)).toHaveLength(1);
  });
});

describe("scheduling a draft through an update", () => {
  test("stores the future publish date and keeps the entry scheduled", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      status: "scheduled",
      publishedAt: new Date("2026-10-18T13:00:00Z"),
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.status).toBe("scheduled");
    expect(updated.publishedAt).toEqual(new Date("2026-10-18T13:00:00Z"));
  });

  test("without a publish date is refused", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      status: "scheduled",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "scheduled_requires_future_date" },
    });
  });
});

describe("updating a scheduled entry", () => {
  test("past its publish date, still awaiting the cron, is not refused", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const due = await site.factory.entry.create({
      authorId: author.id,
      status: "scheduled",
      publishedAt: new Date("2026-10-18T11:59:59Z"),
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: due.id,
      title: "fixed a typo",
      ifMatch: etagOf(due.updatedAt),
    });

    expect(updated.title).toBe("fixed a typo");
    expect(updated.status).toBe("scheduled");
  });

  test("to publish it before its date stamps the publish date now", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const author = await site.factory.author.create();
    const scheduled = await site.factory.entry.create({
      authorId: author.id,
      status: "scheduled",
      publishedAt: new Date("2026-10-19T12:00:00Z"),
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: scheduled.id,
      status: "published",
      ifMatch: etagOf(scheduled.updatedAt),
    });

    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toEqual(new Date("2026-10-18T12:00:00Z"));
  });
});
