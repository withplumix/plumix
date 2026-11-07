import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const site = await testSite({
  plugins: [blogPlugin],
  config: { theme: defineTheme({ templates: [fallback(() => null)] }) },
});

describe("a page's <title>", () => {
  test("an untitled entry falls back for <title> — no empty or orphan-separator title", async () => {
    await site.factory.setting.create({
      group: "site",
      key: "title",
      value: "Demo",
    });
    await site.factory.published.create({
      slug: "nameless",
      title: "",
      excerpt: "",
    });

    const page = await site.visit("/post/nameless");

    // The empty title is treated as absent: no `<title></title>` and no
    // orphaned " · Demo" separator from a `%s`-substituted empty string.
    page.assertSee("<title>Demo</title>").assertDontSee("<title></title>");
  });
});
