import type { Entry, User } from "plumix/schema";
import type { CdnFake } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { fakeCdn } from "plumix/test";
import { defineTemplate, defineTheme, entry, entryType } from "plumix/theme";
import { describe, expect, test } from "vitest";

import type { Harness } from "./test/harness.js";
import type { CommentsConfig, CommentStatus } from "./types.js";
import { commentFactory } from "./test/factories.js";
import { harnessWith } from "./test/harness.js";

/** Posts with an archive at `/posts` that lists each one as a card. */
const blog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "posts" },
    });
  },
});

/** A permalink rendering the entry's approved thread, and a card archive. */
const theme = defineTheme({
  templates: [
    entry(
      defineTemplate({
        comments: ["current"],
        render: (args) => (
          <ul>
            {args.comments?.current?.comments.map((comment) => (
              <li key={comment.id}>{comment.authorName}</li>
            )) ?? null}
          </ul>
        ),
      }),
    ),
    entryType(({ data }) => (
      <ul>
        {data.entries.map((card) => (
          <li key={card.id}>{card.title}</li>
        ))}
      </ul>
    )),
  ],
});

interface Site {
  readonly h: Harness;
  readonly cdn: CdnFake;
  readonly admin: User;
}

async function site(config: CommentsConfig = {}): Promise<Site> {
  const cdn = fakeCdn();
  const h = await harnessWith(
    { entryTypes: ["post"], ...config },
    { blog, cdn, config: { theme } },
  );
  const admin = await h.seedUser("admin");
  return { h, cdn, admin };
}

async function seedPost(s: Site, slug: string): Promise<Entry> {
  return s.h.factory.entry.create({
    type: "post",
    slug,
    title: slug,
    status: "published",
    authorId: s.admin.id,
    publishedAt: new Date(),
  });
}

function seedComment(
  s: Site,
  attrs: {
    entryId: number;
    status?: CommentStatus;
    parentId?: number;
    createdAt?: Date;
  },
) {
  return commentFactory.transient({ db: s.h.db }).create(attrs);
}

async function render(s: Site, path: string): Promise<void> {
  (await s.h.fetch(path)).assertStatus(200);
  await s.h.drainDeferred();
  s.cdn.assertStored(path);
}

async function rpc(s: Site, procedure: string, input: unknown): Promise<void> {
  const response = await s.h.fetch(`/_plumix/rpc/comments/${procedure}`, {
    method: "POST",
    as: s.admin,
    json: { json: input },
  });
  response.assertStatus(200);
  await s.h.drainDeferred();
}

async function submit(s: Site, entryId: number) {
  const response = await s.h.fetch("/_plumix/comments/submit", {
    method: "POST",
    json: {
      entryId,
      name: "Ada",
      email: "ada@example.test",
      body: "hello world",
    },
  });
  response.assertStatus(200);
  await s.h.drainDeferred();
  return response.json();
}

describe("@plumix/plugin-comments — CDN", () => {
  test("approving a comment purges its entry page and the entry's older comment page", async () => {
    const s = await site({ rootsPerPage: 1 });
    const post = await seedPost(s, "hello");
    await seedComment(s, {
      entryId: post.id,
      status: "approved",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    const held = await seedComment(s, { entryId: post.id });
    await render(s, "/posts/hello");
    await render(s, "/posts/hello?comments=1780358400_9");

    await rpc(s, "approve", { id: held.id });

    s.cdn.assertNotStored("/posts/hello");
    s.cdn.assertNotStored("/posts/hello?comments=1780358400_9");
  });

  test("approving a comment leaves another entry's page stored", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    await seedPost(s, "other");
    const held = await seedComment(s, { entryId: post.id });
    await render(s, "/posts/other");

    await rpc(s, "approve", { id: held.id });

    s.cdn.assertStored("/posts/other");
  });

  test("approving a comment leaves an archive that shows the entry as a card stored", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    const held = await seedComment(s, { entryId: post.id });
    await render(s, "/posts");

    await rpc(s, "approve", { id: held.id });

    s.cdn.assertStored("/posts");
  });

  test.each<[string, CommentStatus]>([
    ["spam", "approved"],
    ["trash", "approved"],
    ["restore", "trash"],
    ["approve", "spam"],
  ])(
    "%s on a comment that was %s purges its entry page",
    async (procedure, status) => {
      const s = await site();
      const post = await seedPost(s, "hello");
      const comment = await seedComment(s, { entryId: post.id, status });
      await render(s, "/posts/hello");

      await rpc(s, procedure, { id: comment.id });

      s.cdn.assertNotStored("/posts/hello");
    },
  );

  test.each<[string, CommentStatus]>([
    ["spam", "pending"],
    ["trash", "pending"],
    ["trash", "spam"],
    ["approve", "approved"],
  ])(
    "%s on a comment that was %s leaves its entry page stored",
    async (procedure, status) => {
      const s = await site();
      const post = await seedPost(s, "hello");
      const comment = await seedComment(s, { entryId: post.id, status });
      await render(s, "/posts/hello");

      await rpc(s, procedure, { id: comment.id });

      s.cdn.assertStored("/posts/hello");
    },
  );

  test("bulk approve across two entries purges both entry pages", async () => {
    const s = await site();
    const first = await seedPost(s, "first");
    const second = await seedPost(s, "second");
    const ids = [
      (await seedComment(s, { entryId: first.id })).id,
      (await seedComment(s, { entryId: second.id })).id,
    ];
    await render(s, "/posts/first");
    await render(s, "/posts/second");

    await rpc(s, "bulk", { ids, action: "approve" });

    s.cdn.assertNotStored("/posts/first");
    s.cdn.assertNotStored("/posts/second");
  });

  test("bulk spam of held comments leaves their entry page stored", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    const ids = [
      (await seedComment(s, { entryId: post.id })).id,
      (await seedComment(s, { entryId: post.id })).id,
    ];
    await render(s, "/posts/hello");

    await rpc(s, "bulk", { ids, action: "spam" });

    s.cdn.assertStored("/posts/hello");
  });

  test("purge on an approved leaf deletes it, fires comment:deleted and purges its entry page", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    const leaf = await seedComment(s, { entryId: post.id, status: "approved" });
    const deleted = s.h.spyAction("comment:deleted");
    await render(s, "/posts/hello");

    await rpc(s, "purge", { id: leaf.id });

    deleted.assertCalledOnce();
    expect(deleted.lastArgs?.[0]).toEqual(leaf);
    s.cdn.assertNotStored("/posts/hello");
  });

  test("purge on an approved comment with replies tombstones it, fires comment:deleted and purges its entry page", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    const parent = await seedComment(s, {
      entryId: post.id,
      status: "approved",
    });
    await seedComment(s, {
      entryId: post.id,
      status: "approved",
      parentId: parent.id,
    });
    const deleted = s.h.spyAction("comment:deleted");
    await render(s, "/posts/hello");

    await rpc(s, "purge", { id: parent.id });

    deleted.assertCalledOnce();
    expect(deleted.lastArgs?.[0]).toEqual(parent);
    s.cdn.assertNotStored("/posts/hello");
  });

  test("purge on a held comment leaves its entry page stored", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    const held = await seedComment(s, { entryId: post.id });
    await render(s, "/posts/hello");

    await rpc(s, "purge", { id: held.id });

    s.cdn.assertStored("/posts/hello");
  });

  test("purge on an unknown id fires nothing and leaves the entry page stored", async () => {
    const s = await site();
    await seedPost(s, "hello");
    const deleted = s.h.spyAction("comment:deleted");
    await render(s, "/posts/hello");

    await rpc(s, "purge", { id: 999 });

    deleted.assertNotCalled();
    s.cdn.assertStored("/posts/hello");
  });

  test("submitting an auto-approved comment purges its entry page", async () => {
    const s = await site({ mode: "none" });
    const post = await seedPost(s, "hello");
    await render(s, "/posts/hello");

    expect(await submit(s, post.id)).toEqual({ status: "approved" });

    s.cdn.assertNotStored("/posts/hello");
  });

  test("submitting a comment held for moderation leaves its entry page stored", async () => {
    const s = await site({ mode: "all" });
    const post = await seedPost(s, "hello");
    await render(s, "/posts/hello");

    expect(await submit(s, post.id)).toEqual({ status: "pending" });

    s.cdn.assertStored("/posts/hello");
  });

  test("submitting a comment a filter demotes to spam leaves its entry page stored", async () => {
    const s = await site({ mode: "none" });
    const post = await seedPost(s, "hello");
    s.h.spyFilter("comment:moderate").override(() => "spam");
    await render(s, "/posts/hello");

    expect(await submit(s, post.id)).toEqual({ status: "spam" });

    s.cdn.assertStored("/posts/hello");
  });
});
