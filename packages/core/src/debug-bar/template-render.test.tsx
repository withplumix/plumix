import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { entry } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const theme = defineTheme({ templates: [entry(() => null)] });

describe("debug bar Template panel (end to end)", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("surfaces the route node and matched rule a real render resolved", async () => {
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
    // The resolved node label + the matched generic tier ("entry"), pinned to
    // their exact `DebugKV` value cells so incidental substrings don't pass.
    expect(html).toContain("<dd>post: hello</dd>");
    expect(html).toContain("<dd>entry</dd>");
  });
});
