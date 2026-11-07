import { describe, test } from "vitest";

import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
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

const htmlTheme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
  ],
});

const catHtml = {
  version: "plumix.v2" as const,
  blocks: [
    {
      id: "r1",
      name: "core/html",
      attrs: { html: '<p><img src="/cat.png" alt="cat"></p>' },
    },
  ],
};

const site = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: htmlTheme,
    blocks: {
      htmlAllowlist: {
        extraTags: ["img"],
        extraAttributes: { img: ["src", "alt"] },
      },
    },
  },
});

describe("an operator's html allowlist", () => {
  test("an operator's extraTags/extraAttributes survive the render", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "raw",
      content: catHtml,
    });

    const page = await site.visit("/post/raw");

    page.assertSee('<img src="/cat.png" alt="cat" />');
  });

  test("core/rich-text honours the override too, not just core/html", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "rich",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "t1",
            name: "core/rich-text",
            attrs: { body: '<p><img src="/cat.png"></p>' },
          },
        ],
      },
    });

    const page = await site.visit("/post/rich");

    page.assertSee('<img src="/cat.png" />');
  });

  // The canvas remounts client-side with no server context, so the allowlist
  // must ride the SSR embed.
  test("an edit-mode dispatch embeds the operator's allowlist for the canvas", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "raw",
      content: catHtml,
    });

    const page = await site.actingAs("admin").visit("/post/raw?plumix.edit");

    page.assertSeeInOrder([
      'data-plumix-render-env=""',
      '"img"],"allowedAttributes":{',
    ]);
  });
});

const baselineSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: htmlTheme },
});

describe("the baseline html allowlist", () => {
  test("without the override the same markup is stripped to the baseline", async () => {
    await baselineSite.factory.published.create({
      type: "post",
      slug: "raw",
      content: catHtml,
    });

    const page = await baselineSite.visit("/post/raw");

    // Positive control: a 404 or a template miss would satisfy the first
    // assertion on its own, so pin that the block did render.
    page.assertDontSee("cat.png").assertSee("<p></p>");
  });
});

/**
 * This wiring is what turns the override into a live lever, so the floors
 * under it need pinning on the composed path, not just in their own unit.
 */
const deniedSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: htmlTheme,
    blocks: {
      htmlAllowlist: {
        extraTags: ["script", "iframe"],
        extraAttributes: { p: ["onclick"] },
      },
    },
  },
});

describe("an override that names denied tags", () => {
  test("the floors still hold against an override that names denied tags", async () => {
    await deniedSite.factory.published.create({
      type: "post",
      slug: "raw",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "r1",
            name: "core/html",
            attrs: {
              html: '<p onclick="x()">hi</p><script>x()</script><iframe src="/x"></iframe>',
            },
          },
        ],
      },
    });

    const page = await deniedSite.visit("/post/raw");

    page
      .assertSee("<p>hi</p>")
      .assertDontSee("<script>x()</script>")
      .assertDontSee("<iframe")
      .assertDontSee("onclick");
  });
});
