import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const theme = defineTheme({ templates: { index: () => null } });

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
    // The resolve step queried the DB, so at least one query renders.
    expect(html).toContain("plumix-debug-bar__kind");
    expect(html.toLowerCase()).toContain("select");
  });
});
