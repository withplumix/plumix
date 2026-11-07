import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const hierarchicalPagesPlugin = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
    });
  },
});

const site = await testSite({
  plugins: [blogPlugin, hierarchicalPagesPlugin],
});

describe("the front page", () => {
  test("lists posts but excludes hierarchical pages", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "a-post",
      title: "A Post",
    });
    await site.factory.published.create({
      type: "page",
      slug: "a-page",
      title: "A Page",
    });

    const page = await site.visit("/");

    page.assertOk().assertSee("A Post").assertDontSee("A Page");
  });
});
