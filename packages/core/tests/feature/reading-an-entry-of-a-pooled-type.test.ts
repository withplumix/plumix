import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/**
 * `news` pools its permissions with `post`, so `entry:post:*` reaches news
 * entries and `entry:news:*` is never minted.
 */
const site = await testSite({
  plugins: [
    definePlugin("site", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts" });
        ctx.registerEntryType("news", {
          label: "News",
          capabilityType: "post",
        });
      },
    }),
  ],
});

describe("an entry type pooled onto another's capabilities", () => {
  test("is listed through the pooled capabilities", async () => {
    await site.factory.published.create({ type: "news", slug: "news-1" });

    const rows = await site.actingAs("editor").rpc.entry.list({ type: "news" });

    expect(rows).toEqual([expect.objectContaining({ slug: "news-1" })]);
  });

  test("is read through the pooled capabilities", async () => {
    const row = await site.factory.published.create({
      type: "news",
      slug: "news-2",
    });

    const got = await site.actingAs("editor").rpc.entry.get({ id: row.id });

    expect(got).toMatchObject({ slug: "news-2" });
  });
});
