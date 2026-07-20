import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const theme = defineTheme({ templates: [fallback(() => null)] });

describe("debug bar Database panel (end to end)", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("surfaces the queries a real page render ran", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const res = await h.dispatch(new Request("https://cms.example/post/hello"));
    const html = await res.text();

    expect(html).toContain('data-testid="plumix-debug-panel-database"');
    // The resolve step queried the DB, so a real query row renders. Assert on
    // rendered SQL content (table + column names) — every panel CSS class is in
    // the inlined stylesheet, so only dynamic query text is a trustworthy signal.
    expect(html).toContain("entries");
    expect(html).toContain("author_id");
  });
});
