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

describe("debug bar Timeline panel (end to end)", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("records dispatch, resolve, render, and database spans for a real render", async () => {
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

    expect(html).toContain('data-testid="plumix-debug-panel-timeline"');
    // The waterfall renders the phase spans and at least one timed query.
    expect(html).toContain("<svg");
    expect(html).toContain("dispatch");
    expect(html).toContain("resolve");
    expect(html).toContain("render");
    expect(html).toContain("db: select");
  });
});
