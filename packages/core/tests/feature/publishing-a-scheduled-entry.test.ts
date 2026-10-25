import { describe, test } from "vitest";

import { requestStore } from "../../src/context/stores.js";
import { definePlugin } from "../../src/plugin/define.js";
import { publishDueScheduledEntries } from "../../src/rpc/procedures/entry/publish-scheduled.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

/** Core's publish task, run where a firing runs it: inside the site's context. */
async function runPublishTask(): Promise<void> {
  const ctx = site.context;
  await requestStore.run(ctx, () => publishDueScheduledEntries(ctx));
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
