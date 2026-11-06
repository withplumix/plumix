import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

const DAY_MS = 24 * 60 * 60 * 1000;

describe("an entry saved after the site's clock travels", () => {
  test("is stamped with the site's time, not real time", async () => {
    const editor = site.actingAs("editor");
    const entry = await editor.rpc.entry.create({
      type: "post",
      title: "Hello",
      slug: "hello",
    });

    site.travel({ days: 1 });
    const updated = await editor.rpc.entry.update({
      id: entry.id,
      title: "Hello again",
      ifMatch: etagOf(entry.updatedAt),
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      entry.updatedAt.getTime() + DAY_MS,
    );
  });
});
