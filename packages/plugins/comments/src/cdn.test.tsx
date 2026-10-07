import type { ConnectedCdn } from "plumix";
import type { Entry, User } from "plumix/schema";
import { defineTemplate, defineTheme, entry } from "plumix/theme";
import { describe, expect, test, vi } from "vitest";

import type { Harness } from "./test/harness.js";
import type { CommentsConfig } from "./types.js";
import { commentFactory } from "./test/factories.js";
import { harnessWith } from "./test/harness.js";

function cdnStub() {
  const put = vi.fn<NonNullable<ConnectedCdn["store"]>["put"]>(() =>
    Promise.resolve(),
  );
  const purgeTags = vi.fn<NonNullable<ConnectedCdn["purgeTags"]>>(() =>
    Promise.resolve(),
  );
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: { match: () => Promise.resolve(undefined), put },
    purgeTags,
  };
  return { cdn, put, purgeTags };
}

// A permalink template rendering the entry's approved thread.
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
  ],
});

interface Site {
  readonly h: Harness;
  readonly put: ReturnType<typeof cdnStub>["put"];
  readonly purgeTags: ReturnType<typeof cdnStub>["purgeTags"];
  readonly admin: User;
}

async function site(config: CommentsConfig = {}): Promise<Site> {
  const { cdn, put, purgeTags } = cdnStub();
  const h = await harnessWith(
    { entryTypes: ["post"], ...config },
    { cdn, config: { theme } },
  );
  const admin = await h.seedUser("admin");
  return { h, put, purgeTags, admin };
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
    status?: "pending" | "approved";
    parentId?: number;
  },
) {
  return commentFactory.transient({ db: s.h.db }).create(attrs);
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

function purged(s: Site): readonly string[] {
  return s.purgeTags.mock.calls.flatMap(([tags]) => [...tags]);
}

function expectNoTypeTag(s: Site): void {
  expect(purged(s).filter((tag) => tag.startsWith("t:"))).toEqual([]);
}

describe("@plumix/plugin-comments — CDN tags", () => {
  test("rendering an entry permalink stores it under the entry's tag", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");

    await s.h.dispatch(new Request("https://cms.example/posts/hello"));
    await s.h.drainDeferred();

    expect(s.put.mock.calls[0]?.[2]).toContain(`e:${String(post.id)}`);
  });

  test.each(["approve", "restore", "spam", "trash"])(
    "%s on a comment purges its entry's tag",
    async (procedure) => {
      const s = await site();
      const post = await seedPost(s, "hello");
      const comment = await seedComment(s, { entryId: post.id });

      await rpc(s, procedure, { id: comment.id });

      expect(purged(s)).toContain(`e:${String(post.id)}`);
      expectNoTypeTag(s);
    },
  );

  test("bulk across two entries purges both entries' tags in one call", async () => {
    const s = await site();
    const first = await seedPost(s, "first");
    const second = await seedPost(s, "second");
    const ids = [
      (await seedComment(s, { entryId: first.id })).id,
      (await seedComment(s, { entryId: first.id })).id,
      (await seedComment(s, { entryId: second.id })).id,
    ];

    await rpc(s, "bulk", { ids, action: "approve" });

    expect(s.purgeTags).toHaveBeenCalledOnce();
    expect(purged(s)).toEqual(
      expect.arrayContaining([
        `e:${String(first.id)}`,
        `e:${String(second.id)}`,
      ]),
    );
    expectNoTypeTag(s);
  });

  test("purge on a leaf deletes it, fires comment:deleted and purges its entry's tag", async () => {
    const s = await site();
    const post = await seedPost(s, "hello");
    const leaf = await seedComment(s, { entryId: post.id, status: "approved" });
    const deleted = s.h.spyAction("comment:deleted");

    await rpc(s, "purge", { id: leaf.id });

    deleted.assertCalledOnce();
    expect(deleted.lastArgs?.[0]).toEqual(leaf);
    expect(purged(s)).toContain(`e:${String(post.id)}`);
    expectNoTypeTag(s);
  });

  test("purge on a comment with replies tombstones it, fires comment:deleted and purges its entry's tag", async () => {
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

    await rpc(s, "purge", { id: parent.id });

    deleted.assertCalledOnce();
    expect(deleted.lastArgs?.[0]).toEqual(parent);
    expect(purged(s)).toContain(`e:${String(post.id)}`);
    expectNoTypeTag(s);
  });

  test("purge on an unknown id fires nothing and purges nothing", async () => {
    const s = await site();
    const deleted = s.h.spyAction("comment:deleted");

    await rpc(s, "purge", { id: 999 });

    deleted.assertNotCalled();
    expect(s.purgeTags).not.toHaveBeenCalled();
  });

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

  test("submitting an auto-approved comment purges its entry's tag", async () => {
    const s = await site({ mode: "none" });
    const post = await seedPost(s, "hello");

    expect(await submit(s, post.id)).toEqual({ status: "approved" });

    expect(purged(s)).toContain(`e:${String(post.id)}`);
    expectNoTypeTag(s);
  });

  test("submitting a comment held for moderation purges nothing", async () => {
    const s = await site({ mode: "all" });
    const post = await seedPost(s, "hello");

    expect(await submit(s, post.id)).toEqual({ status: "pending" });

    expect(s.purgeTags).not.toHaveBeenCalled();
  });
});
