import { expect, test } from "vitest";

import { Link } from "@plumix/blocks/renderer";

import { definePlugin } from "../plugin/define.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { fallback } from "./render/template-builders.js";

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerTermTaxonomy("topic", { label: "Topics", entryTypes: ["post"] });
});

// A theme that links to the first front-page entry and its first term — the
// end-to-end path: resolve attaches url → provider carries basePath → Link.
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

test("Link resolves entry/term permalinks with the configured basePath", async () => {
  const h = await createDispatcherHarness({
    plugins: [blog],
    theme: linkTheme,
    basePath: "/blog",
  });
  const author = await h.seedUser("admin");
  const term = await h.factory.term.create({
    taxonomy: "topic",
    slug: "edge",
    name: "Edge",
  });
  const post = await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    content: null,
    status: "published",
    authorId: author.id,
    publishedAt: new Date("2026-04-10"),
  });
  await h.factory.entryTerm.create({ entryId: post.id, termId: term.id });

  const response = await h.dispatch(new Request("https://cms.example/blog/"));
  const body = await response.text();

  expect(body).toContain('<a href="/blog/post/hello">Hello</a>');
  expect(body).toContain('<a href="/blog/topic/edge">Edge</a>');
});
