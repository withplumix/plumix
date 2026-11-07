import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { entry } from "../../src/hooks/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

/**
 * An editor's write landing while the task publishes an earlier entry: one
 * entry is published by hand, another is moved past the run.
 */
const editorMeanwhile = definePlugin("meanwhile", {
  setup: (ctx) => {
    ctx.events.on(entry.published, async (_payload, handlerCtx) => {
      await handlerCtx.db
        .update(entries)
        .set({ status: "published" })
        .where(eq(entries.slug, "published-meanwhile"));
      await handlerCtx.db
        .update(entries)
        .set({ publishedAt: new Date("2026-01-01T12:01:00Z") })
        .where(eq(entries.slug, "rescheduled-meanwhile"));
    });
  },
});

const site = await testSite({ plugins: [posts, editorMeanwhile] });

/** Core's publish task, run as a firing runs it. */
async function runPublishTask(): Promise<void> {
  (await site.runTask("core:publish-scheduled")).assertRan(
    "core:publish-scheduled",
  );
}

async function statusOf(id: number): Promise<string | undefined> {
  const row = await site.context.db.query.entries.findFirst({
    where: eq(entries.id, id),
  });
  return row?.status;
}

/** Long past in real time, so only the site's clock keeps the entry ahead. */
async function scheduleForNoon(): Promise<void> {
  site.freezeTime("2020-01-01T09:00:00Z");
  await site.actingAs("editor").rpc.entry.create({
    type: "post",
    title: "Hello",
    slug: "hello",
    status: "scheduled",
    publishedAt: new Date("2020-01-01T12:00:00Z"),
  });
}

describe("an entry scheduled for later", () => {
  test("stays unpublished while its time is ahead", async () => {
    await scheduleForNoon();

    await runPublishTask();

    (await site.visit("/post/hello")).assertNotFound();
  });

  test("is published by the task once the site travels past its time", async () => {
    await scheduleForNoon();

    site.travel({ hours: 3, minutes: 1 });
    await runPublishTask();

    (await site.visit("/post/hello")).assertOk().assertSee("Hello");
  });
});

describe("the publish task", () => {
  test("publishes only the scheduled entries whose time has passed, emitting published for each", async () => {
    site.freezeTime("2026-01-01T12:00:00Z");
    const due = await site.factory.entry.create({
      status: "scheduled",
      publishedAt: new Date("2026-01-01T11:59:59Z"),
    });
    const notYet = await site.factory.entry.create({
      status: "scheduled",
      publishedAt: new Date("2026-01-01T12:01:00Z"),
    });

    await runPublishTask();

    site.logger.assertLogged(
      "info",
      "[plumix] publish-scheduled published 1 entry",
    );
    expect(await statusOf(due.id)).toBe("published");
    expect(await statusOf(notYet.id)).toBe("scheduled");
    expect(site.events.emitted(entry.published).map((p) => p.entry.id)).toEqual(
      [due.id],
    );
  });

  test("does nothing when no scheduled entry is due", async () => {
    site.freezeTime("2026-01-01T12:00:00Z");
    await site.factory.entry.create({
      status: "scheduled",
      publishedAt: new Date("2026-01-01T12:01:00Z"),
    });

    await runPublishTask();

    site.logger.assertNothingLogged("info");
    site.events.assertNotEmitted(entry.published);
  });

  test("publishes an entry due at the very second the run starts", async () => {
    site.freezeTime("2100-01-01T00:00:00Z");
    const due = await site.factory.entry.create({
      status: "scheduled",
      publishedAt: new Date("2100-01-01T00:00:00Z"),
    });

    await runPublishTask();

    site.logger.assertLogged(
      "info",
      "[plumix] publish-scheduled published 1 entry",
    );
    expect(await statusOf(due.id)).toBe("published");
  });

  test("leaves an entry an editor published after the run read it", async () => {
    site.freezeTime("2026-01-01T12:00:00Z");
    const first = await site.factory.entry.create({
      status: "scheduled",
      publishedAt: new Date("2026-01-01T11:59:58Z"),
    });
    await site.factory.entry.create({
      slug: "published-meanwhile",
      status: "scheduled",
      publishedAt: new Date("2026-01-01T11:59:59Z"),
    });

    await runPublishTask();

    site.logger.assertLogged(
      "info",
      "[plumix] publish-scheduled published 1 entry",
    );
    expect(site.events.emitted(entry.published).map((p) => p.entry.id)).toEqual(
      [first.id],
    );
  });

  test("leaves an entry an editor rescheduled after the run read it", async () => {
    site.freezeTime("2026-01-01T12:00:00Z");
    await site.factory.entry.create({
      status: "scheduled",
      publishedAt: new Date("2026-01-01T11:59:58Z"),
    });
    const second = await site.factory.entry.create({
      slug: "rescheduled-meanwhile",
      status: "scheduled",
      publishedAt: new Date("2026-01-01T11:59:59Z"),
    });

    await runPublishTask();

    site.logger.assertLogged(
      "info",
      "[plumix] publish-scheduled published 1 entry",
    );
    expect(await statusOf(second.id)).toBe("scheduled");
  });
});
