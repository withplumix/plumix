import { describe, test } from "vitest";

import { Link } from "../../src/blocks/renderer/index.js";
import { definePlugin } from "../../src/plugin/define.js";
import { fallback } from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      entryTypes: ["post"],
    });
  },
});

/**
 * A theme that links to the first front-page entry and its first term — the
 * end-to-end path: resolve attaches url → provider carries basePath → Link.
 */
const linkTheme = defineTheme({
  templates: [
    fallback(
      defineTemplate({
        render: ({ data }) => {
          const entry = "entries" in data ? data.entries[0] : undefined;
          const term = entry?.terms[0];
          return (
            <main>
              {entry ? <Link entry={entry}>{entry.title}</Link> : null}
              {term ? <Link term={term}>{term.name}</Link> : null}
            </main>
          );
        },
      }),
    ),
  ],
});

const site = await testSite({
  plugins: [blog],
  config: { theme: linkTheme, basePath: "/blog" },
});

describe("a theme's Link", () => {
  test("resolves entry and term permalinks with the configured basePath", async () => {
    const term = await site.factory.term.create({
      taxonomy: "topic",
      slug: "edge",
      name: "Edge",
    });
    const post = await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      publishedAt: new Date("2026-04-10"),
    });
    await site.factory.entryTerm.create({ entryId: post.id, termId: term.id });

    const page = await site.visit("/blog/");

    page
      .assertSee('<a href="/blog/post/hello">Hello</a>')
      .assertSee('<a href="/blog/topic/edge">Edge</a>');
  });
});
