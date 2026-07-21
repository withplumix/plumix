import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { fallback, forEntryType } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

// The slug-narrowed rule is skipped (wrong slug), the plain `post` rule wins,
// and `fallback` is never reached — one of each status in the table.
const theme = defineTheme({
  templates: [
    fallback(() => null),
    forEntryType("post")
      .slug("other")
      .template(() => null),
    forEntryType("post").template(() => null),
  ],
});

describe("debug bar Template panel (end to end)", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("surfaces the full resolution walk a real render resolved", async () => {
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

    expect(html).toContain('data-testid="plumix-debug-panel-template"');
    // Resolved node + winning rule, pinned to their exact `DebugKV` value cells.
    expect(html).toContain("<dd>post: hello</dd>");
    expect(html).toContain("<dd>post</dd>");
    // The table surfaces all three statuses: the winner, the skipped
    // slug-narrowed rule, and the never-reached fallback.
    expect(html).toContain("plumix-debug-bar__status--matched");
    expect(html).toContain("plumix-debug-bar__status--skipped");
    expect(html).toContain("plumix-debug-bar__status--never-evaluated");
  });
});
