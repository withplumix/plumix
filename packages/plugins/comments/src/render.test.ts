import type { AnyPluginDescriptor } from "plumix";
import type { EntryData } from "plumix/theme";
import type { ReactNode } from "react";
import { createElement as el } from "react";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { defineTemplate, defineTheme, entry, fallback } from "plumix/theme";
import { describe, expect, test } from "vitest";

import type { ResolvedThread } from "./server/load-thread.js";
import { comments } from "./index.js";
import { applyCommentsSchema } from "./test/db.js";
import { commentFactory } from "./test/factories.js";
import { gatedBlog } from "./test/harness.js";
import { PlumixCommentForm, PlumixCommentThread } from "./theme.js";

/**
 * Minimal host plugin registering a public `post` type so the dispatcher
 * compiles a `/posts/:slug` single route.
 */
const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
  },
});

/**
 * Theme that renders the approved thread the `comments` dep resolves,
 * recursing into nested replies.
 */
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

const single = defineTemplate<EntryData>({
  comments: ["current"],
  render: ({ data, comments: threadDep }) => {
    const thread: ResolvedThread | null = threadDep?.current ?? null;
    return el(
      "main",
      null,
      el("h1", { "data-testid": "post-title" }, data.entry.title),
      el("p", { "data-testid": "comments-count" }, String(thread?.count ?? 0)),
      el("ul", null, ...(thread?.comments ?? []).map(renderComment)),
      thread?.hasMore
        ? el(
            "button",
            {
              "data-testid": "load-more",
              "data-cursor": thread.nextCursor ?? "",
            },
            "Load more",
          )
        : null,
    );
  },
});

const theme = defineTheme({
  templates: [fallback(() => null), entry(single)],
});

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

const formTheme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) => el(PlumixCommentForm, { entryId: data.entry.id })),
  ],
});

const EMAIL_REQUIRED = /data-plumix-comment-control="email"[^>]*required/;

/**
 * A site whose theme renders the comment form, booted now, and a visit to it.
 */
async function formSite(
  plugins: readonly AnyPluginDescriptor[],
): Promise<() => Promise<string>> {
  const harness = await createDispatcherHarness({
    config: { plugins: [testBlog, ...plugins], theme: formTheme },
  });
  await applyCommentsSchema(harness.db);
  await seedPost(harness, "hello-world");
  return async () => {
    const response = await harness.fetch("/posts/hello-world");
    response.assertStatus(200);
    return response.text();
  };
}

describe("the comment form in a theme template", () => {
  test("asks for an email exactly when its own install does", async () => {
    const visitLenient = await formSite([
      comments({ entryTypes: ["post"], requireEmail: false }),
    ]);
    const visitStrict = await formSite([comments({ entryTypes: ["post"] })]);

    const lenientHtml = await visitLenient();
    const strictHtml = await visitStrict();

    expect(lenientHtml).toContain('data-plumix-comment-control="email"');
    expect(lenientHtml).not.toMatch(EMAIL_REQUIRED);
    expect(strictHtml).toMatch(EMAIL_REQUIRED);
  });

  test("renders nothing on a site without the plugin", async () => {
    const visit = await formSite([]);

    expect(await visit()).not.toContain("data-plumix-comment");
  });
});

describe("comments read path through the dispatcher", () => {
  test("renders approved comments on a single post and excludes pending", async () => {
    const harness = await createDispatcherHarness({
      config: {
        plugins: [testBlog, comments({ entryTypes: ["post"] })],
        theme,
      },
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

  test("still renders the thread to a member the gate admits", async () => {
    // Keeps the access check out of `isCommentingEnabled`: the SSR thread
    // rides the entry's page, which the dispatcher already gated.
    const harness = await createDispatcherHarness({
      config: {
        plugins: [gatedBlog, comments({ entryTypes: ["post"] })],
        theme,
      },
    });
    await applyCommentsSchema(harness.db);
    const entry = await seedPost(harness, "members-only");
    await commentFactory
      .transient({ db: harness.db })
      .create({ entryId: entry.id, status: "approved", bodyMd: "for members" });
    const member = await harness.seedUser("subscriber");

    const response = await harness.fetch("/posts/members-only", { as: member });

    response.assertStatus(200);
    expect(await response.text()).toContain("for members");
  });

  test("renders no thread for a comment-disabled entry type", async () => {
    const harness = await createDispatcherHarness({
      config: { plugins: [testBlog, comments()], theme: theme },
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
      config: {
        plugins: [testBlog, comments({ entryTypes: ["post"] })],
        theme,
      },
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

  // Public content can't render under `plumix dev` (it serves the admin
  // SPA), so load-more is covered here rather than in e2e.
  test("shows a load-more affordance and reveals the next root page", async () => {
    const harness = await createDispatcherHarness({
      config: {
        plugins: [
          testBlog,
          comments({ entryTypes: ["post"], rootsPerPage: 2 }),
        ],
        theme,
      },
    });
    await applyCommentsSchema(harness.db);
    const entry = await seedPost(harness, "busy");
    const seed = commentFactory.transient({ db: harness.db });
    for (let i = 1; i <= 3; i++) {
      await seed.create({
        entryId: entry.id,
        status: "approved",
        authorName: `Root ${String(i)}`,
        bodyMd: `root ${String(i)}`,
        createdAt: new Date(`2026-06-0${String(i)}T00:00:00Z`),
      });
    }

    const html = await (await harness.fetch("/posts/busy")).text();
    // First page: the two newest roots and the load-more button; the
    // oldest root is held back. Total count still reflects all three.
    expect(html).toContain('data-testid="comments-count">3<');
    expect(html).toContain("root 3");
    expect(html).toContain("root 2");
    expect(html).not.toContain("root 1");
    expect(html).toContain('data-testid="load-more"');

    const cursor = /data-cursor="([^"]+)"/.exec(html)?.[1];
    expect(cursor).toBeTruthy();
    const next = await (
      await harness.fetch(
        `/_plumix/comments/list?entryId=${String(entry.id)}&cursor=${String(
          cursor,
        )}`,
      )
    ).json<{ comments: { bodyHtml: string }[]; hasMore: boolean }>();
    expect(next.comments).toHaveLength(1);
    expect(next.comments[0]?.bodyHtml).toContain("root 1");
    expect(next.hasMore).toBe(false);
  });
});

/** `count` approved roots, one a day from 2026-06-01, oldest first. */
async function seedDailyRoots(
  harness: Awaited<ReturnType<typeof createDispatcherHarness>>,
  entryId: number,
  count: number,
): Promise<void> {
  const seed = commentFactory.transient({ db: harness.db });
  for (let day = 1; day <= count; day++) {
    await seed.create({
      entryId,
      status: "approved",
      bodyMd: `root ${String(day)}`,
      createdAt: new Date(Date.UTC(2026, 5, day)),
    });
  }
}

/** A theme rendering its own page links from the thread's hrefs. */
const linksTheme = defineTheme({
  templates: [
    fallback(() => null),
    entry(
      defineTemplate<EntryData>({
        comments: ["current"],
        render: ({ comments: threadDep }) => {
          const thread = threadDep?.current ?? null;
          return el(
            "nav",
            null,
            thread?.olderHref
              ? el("a", { "data-testid": "older", href: thread.olderHref })
              : null,
            thread?.newestHref
              ? el("a", { "data-testid": "newest", href: thread.newestHref })
              : null,
          );
        },
      }),
    ),
  ],
});

async function pagedSite(
  config: {
    readonly basePath?: string;
    readonly theme?: ReturnType<typeof defineTheme>;
  } = {},
) {
  const harness = await createDispatcherHarness({
    config: {
      theme,
      ...config,
      plugins: [testBlog, comments({ entryTypes: ["post"], rootsPerPage: 2 })],
    },
  });
  await applyCommentsSchema(harness.db);
  const entry = await seedPost(harness, "busy");
  await seedDailyRoots(harness, entry.id, 5);
  return harness;
}

describe("an older comment page", () => {
  test("renders the roots older than the cursor in its comments query", async () => {
    const harness = await pagedSite();
    const first = await (await harness.fetch("/posts/busy")).text();
    const cursor = /data-cursor="([^"]+)"/.exec(first)?.[1] ?? "";

    const html = await (
      await harness.fetch(`/posts/busy?comments=${cursor}`)
    ).text();

    expect(html).toContain("root 3");
    expect(html).toContain("root 2");
    expect(html).not.toContain("root 4");
    expect(html).not.toContain("root 1");
  });

  test("answers a malformed cursor with a 301 to the entry, other query kept", async () => {
    const harness = await pagedSite();

    const response = await harness.fetch(
      "/posts/busy?utm_source=feed&comments=garbage",
    );

    response.assertStatus(301);
    expect(response.headers.get("location")).toBe(
      "https://cms.example/posts/busy?utm_source=feed",
    );
  });

  test.each([
    {
      page: "/posts/busy",
      older: '<a data-testid="older" href="/posts/busy?comments=1780531200_4">',
      newest: null,
    },
    {
      page: "/posts/busy?comments=1780531200_4",
      older: '<a data-testid="older" href="/posts/busy?comments=1780358400_2">',
      newest: '<a data-testid="newest" href="/posts/busy">',
    },
    {
      page: "/posts/busy?comments=1780358400_2",
      older: null,
      newest: '<a data-testid="newest" href="/posts/busy">',
    },
    {
      page: "/posts/busy?utm_source=feed&comments=1780531200_4",
      older:
        '<a data-testid="older" href="/posts/busy?utm_source=feed&amp;comments=1780358400_2">',
      newest: '<a data-testid="newest" href="/posts/busy?utm_source=feed">',
    },
  ])(
    "hands a theme the older and newest page links on $page",
    async ({ page, older, newest }) => {
      const harness = await pagedSite({ theme: linksTheme });

      const html = await (await harness.fetch(page)).text();

      expect(/<a data-testid="older"[^>]*>/.exec(html)?.[0] ?? null).toBe(
        older,
      );
      expect(/<a data-testid="newest"[^>]*>/.exec(html)?.[0] ?? null).toBe(
        newest,
      );
    },
  );

  test("prefixes the page links with the site's base path", async () => {
    const harness = await pagedSite({ basePath: "/blog", theme: linksTheme });

    const html = await (
      await harness.fetch("/blog/posts/busy?comments=1780531200_4")
    ).text();

    expect(html).toContain('href="/blog/posts/busy?comments=1780358400_2"');
    expect(html).toContain('href="/blog/posts/busy"');
  });

  test("canonicalises to the entry and carries no robots meta", async () => {
    const harness = await pagedSite();

    const html = await (
      await harness.fetch("/posts/busy?comments=1780531200_4")
    ).text();

    expect(html).toContain(
      '<link rel="canonical" href="https://cms.example/posts/busy"/>',
    );
    expect(html).not.toContain('name="robots"');
  });
});

function threadTheme(
  renderBody?: (comment: ResolvedThread["comments"][number]) => ReactNode,
) {
  return defineTheme({
    templates: [
      fallback(() => null),
      entry(
        defineTemplate<EntryData>({
          comments: ["current"],
          render: ({ comments: threadDep }) =>
            el(PlumixCommentThread, {
              thread: threadDep?.current ?? null,
              renderBody,
            }),
        }),
      ),
    ],
  });
}

describe("PlumixCommentThread", () => {
  test("renders an older page's roots between plain older and newest links", async () => {
    const harness = await pagedSite({ theme: threadTheme() });

    const html = await (
      await harness.fetch("/posts/busy?comments=1780531200_4")
    ).text();

    expect(html).toContain("<p>root 3</p>");
    expect(html).toContain("<p>root 2</p>");
    expect(html).not.toContain("<p>root 4</p>");
    expect(html).toMatch(
      /<a[^>]*href="\/posts\/busy\?comments=1780358400_2"[^>]*data-plumix-comment-older=""/,
    );
    expect(html).toMatch(
      /<a[^>]*href="\/posts\/busy"[^>]*data-plumix-comment-newest=""/,
    );
  });

  test("renders a theme's comment body in place of the default", async () => {
    const harness = await pagedSite({
      theme: threadTheme((comment) =>
        el("blockquote", null, `said ${String(comment.id)}`),
      ),
    });

    const html = await (await harness.fetch("/posts/busy")).text();

    expect(html).toContain("<blockquote>said 5</blockquote>");
    expect(html).not.toContain("<p>root 5</p>");
  });
});
