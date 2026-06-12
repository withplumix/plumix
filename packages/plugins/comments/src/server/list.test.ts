import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { CommentsConfig } from "../types.js";
import { comments } from "../index.js";
import { applyCommentsSchema } from "../test/db.js";
import { commentFactory } from "../test/factories.js";

const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
  },
});

type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

async function harnessWith(config: CommentsConfig): Promise<Harness> {
  const harness = await createDispatcherHarness({
    plugins: [testBlog, comments(config)],
  });
  await applyCommentsSchema(harness.db);
  return harness;
}

async function seedPost(harness: Harness, overrides = {}) {
  const user = await harness.factory.user.create({});
  return harness.factory.entry.create({
    type: "post",
    title: "Post",
    authorId: user.id,
    status: "published",
    ...overrides,
  });
}

async function seedRoots(harness: Harness, entryId: number, n: number) {
  const f = commentFactory.transient({ db: harness.db });
  const made = [];
  for (let i = 1; i <= n; i++) {
    made.push(
      await f.create({
        entryId,
        status: "approved",
        bodyMd: `root ${String(i)}`,
        createdAt: new Date(`2026-06-${String(i).padStart(2, "0")}T00:00:00Z`),
      }),
    );
  }
  return made;
}

interface ListPage {
  comments: { id: number; bodyHtml: string; replies: { bodyHtml: string }[] }[];
  hasMore: boolean;
  nextCursor: string | null;
}

describe("GET /_plumix/comments/list", () => {
  test("rejects a missing or invalid entryId", async () => {
    const harness = await harnessWith({ entryTypes: ["post"] });
    (await harness.fetch("/_plumix/comments/list")).assertStatus(400);
    (await harness.fetch("/_plumix/comments/list?entryId=0")).assertStatus(400);
  });

  test("404s for a non-published entry", async () => {
    const harness = await harnessWith({ entryTypes: ["post"] });
    const draft = await seedPost(harness, { status: "draft" });
    (
      await harness.fetch(`/_plumix/comments/list?entryId=${String(draft.id)}`)
    ).assertStatus(404);
  });

  test("403s when the entry type has comments disabled", async () => {
    const harness = await harnessWith({});
    const entry = await seedPost(harness);
    (
      await harness.fetch(`/_plumix/comments/list?entryId=${String(entry.id)}`)
    ).assertStatus(403);
  });

  test("returns the next, older page of roots with their descendants", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      rootsPerPage: 2,
    });
    const entry = await seedPost(harness);
    const [oldest] = await seedRoots(harness, entry.id, 3);
    await commentFactory.transient({ db: harness.db }).create({
      entryId: entry.id,
      status: "approved",
      parentId: oldest?.id,
      bodyMd: "reply to oldest",
    });

    const firstRes = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(entry.id)}`,
    );
    firstRes.assertStatus(200);
    const first = await firstRes.json<ListPage>();
    expect(first.comments).toHaveLength(2);
    expect(first.comments[0]?.bodyHtml).toContain("root 3");
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const secondRes = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(entry.id)}&cursor=${String(
        first.nextCursor,
      )}`,
    );
    const second = await secondRes.json<ListPage>();
    expect(second.comments).toHaveLength(1);
    expect(second.comments[0]?.bodyHtml).toContain("root 1");
    expect(second.comments[0]?.replies[0]?.bodyHtml).toContain(
      "reply to oldest",
    );
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  test("never leaks author email or ip hash in the payload", async () => {
    const harness = await harnessWith({ entryTypes: ["post"] });
    const entry = await seedPost(harness);
    await commentFactory.transient({ db: harness.db }).create({
      entryId: entry.id,
      status: "approved",
      authorEmail: "secret@example.test",
      ipHash: "deadbeef",
    });

    const res = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(entry.id)}`,
    );
    const body = await res.text();
    expect(body).not.toContain("secret@example.test");
    expect(body).not.toContain("deadbeef");
  });
});
