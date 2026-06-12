import type { SingleData } from "plumix";
import { createElement as el } from "react";
import { defineTemplate, defineTheme } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { ResolvedThread } from "./server/load-thread.js";
import { comments } from "./index.js";
import { applyCommentsSchema } from "./test/db.js";
import { commentFactory } from "./test/factories.js";

// Minimal host plugin registering a public `post` type so the dispatcher
// compiles a `/posts/:slug` single route.
const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
  },
});

// Theme that renders the approved thread the `comments` dep resolves,
// recursing into nested replies.
function renderComment(
  comment: ResolvedThread["comments"][number],
): ReturnType<typeof el> {
  return el(
    "li",
    { key: comment.id, "data-testid": "comment" },
    el("span", { "data-testid": "comment-author" }, comment.authorName),
    el("div", { dangerouslySetInnerHTML: { __html: comment.bodyHtml } }),
    comment.replies.length > 0
      ? el(
          "ul",
          { "data-testid": "replies" },
          ...comment.replies.map(renderComment),
        )
      : null,
  );
}

const single = defineTemplate<SingleData>({
  comments: ["current"],
  render: ({ data, comments: threadDep }) => {
    const thread: ResolvedThread | null = threadDep?.current ?? null;
    return el(
      "main",
      null,
      el("h1", { "data-testid": "post-title" }, data.entry.title),
      el("p", { "data-testid": "comments-count" }, String(thread?.count ?? 0)),
      el("ul", null, ...(thread?.comments ?? []).map(renderComment)),
    );
  },
});

const theme = defineTheme({ templates: { index: () => null, single } });

async function seedPost(
  harness: Awaited<ReturnType<typeof createDispatcherHarness>>,
  slug: string,
) {
  const user = await harness.factory.user.create({});
  return harness.factory.entry.create({
    type: "post",
    slug,
    title: "Hello World",
    authorId: user.id,
    status: "published",
  });
}

describe("comments read path through the dispatcher", () => {
  test("renders approved comments on a single post and excludes pending", async () => {
    const harness = await createDispatcherHarness({
      plugins: [testBlog, comments({ entryTypes: ["post"] })],
      theme,
    });
    await applyCommentsSchema(harness.db);
    const entry = await seedPost(harness, "hello-world");
    const seed = commentFactory.transient({ db: harness.db });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      authorName: "Ada Lovelace",
      bodyMd: "**great** post",
    });
    await seed.create({
      entryId: entry.id,
      status: "pending",
      authorName: "Pending Patty",
      bodyMd: "hold me",
    });

    const html = await (await harness.fetch("/posts/hello-world")).text();

    expect(html).toContain("Hello World");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("<strong>great</strong>");
    expect(html).toContain('data-testid="comments-count">1<');
    expect(html).not.toContain("Pending Patty");
  });

  test("renders no thread for a comment-disabled entry type", async () => {
    const harness = await createDispatcherHarness({
      plugins: [testBlog, comments()],
      theme,
    });
    await applyCommentsSchema(harness.db);
    const entry = await seedPost(harness, "quiet");
    await commentFactory.transient({ db: harness.db }).create({
      entryId: entry.id,
      status: "approved",
      authorName: "Unheard",
      bodyMd: "hi",
    });

    const html = await (await harness.fetch("/posts/quiet")).text();

    expect(html).toContain("Hello World");
    expect(html).toContain('data-testid="comments-count">0<');
    expect(html).not.toContain("Unheard");
  });

  test("renders a reply nested under its parent", async () => {
    const harness = await createDispatcherHarness({
      plugins: [testBlog, comments({ entryTypes: ["post"] })],
      theme,
    });
    await applyCommentsSchema(harness.db);
    const entry = await seedPost(harness, "threaded");
    const seed = commentFactory.transient({ db: harness.db });
    const root = await seed.create({
      entryId: entry.id,
      status: "approved",
      bodyMd: "the root",
    });
    await seed.create({
      entryId: entry.id,
      status: "approved",
      parentId: root.id,
      bodyMd: "the reply",
    });

    const html = await (await harness.fetch("/posts/threaded")).text();

    expect(html).toContain('data-testid="comments-count">2<');
    // The reply renders inside the parent's nested replies list.
    const repliesIdx = html.indexOf('data-testid="replies"');
    expect(repliesIdx).toBeGreaterThan(-1);
    expect(html.indexOf("the reply")).toBeGreaterThan(repliesIdx);
  });
});
