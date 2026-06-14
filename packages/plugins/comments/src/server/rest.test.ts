import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

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

async function restHarness(): Promise<Harness> {
  const harness = await createDispatcherHarness({
    api: { enabled: true },
    plugins: [testBlog, comments({ entryTypes: ["post"] })],
  });
  await applyCommentsSchema(harness.db);
  return harness;
}

async function seedPost(harness: Harness, overrides = {}): Promise<number> {
  const user = await harness.factory.user.create({});
  const entry = await harness.factory.entry.create({
    type: "post",
    title: "Post",
    authorId: user.id,
    status: "published",
    ...overrides,
  });
  return entry.id;
}

interface PublicComment {
  readonly id: number;
  readonly parentId: number | null;
  readonly authorName: string;
  readonly bodyHtml: string;
}

interface Envelope {
  readonly data: PublicComment[];
  readonly meta: { page: number; per_page: number };
  readonly links: { self: string; next?: string; prev?: string };
}

function commentsUrl(entryId: number, query = ""): string {
  return `https://cms.example/_plumix/api/v1/posts/${entryId}/comments${query}`;
}

describe("comments REST resource", () => {
  test("returns approved comments flat, each with parentId, in the envelope", async () => {
    const h = await restHarness();
    const entryId = await seedPost(h);
    const f = commentFactory.transient({ db: h.db });
    const root = await f.create({
      entryId,
      status: "approved",
      bodyMd: "root",
    });
    await f.create({
      entryId,
      status: "approved",
      parentId: root.id,
      bodyMd: "reply",
    });

    const res = await h.dispatch(new Request(commentsUrl(entryId)));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope;
    expect(body.data).toHaveLength(2);
    const reply = body.data.find((c) => c.parentId !== null);
    expect(reply?.parentId).toBe(root.id);
    expect(reply?.bodyHtml).toContain("reply");
    expect(body.meta).toMatchObject({ page: 1, per_page: 20 });
  });

  test("strips comment PII and moderation fields", async () => {
    const h = await restHarness();
    const entryId = await seedPost(h);
    await commentFactory.transient({ db: h.db }).create({
      entryId,
      status: "approved",
      authorEmail: "secret@example.test",
      ipHash: "deadbeef",
      userAgent: "Mozilla/5.0",
    });

    const res = await h.dispatch(new Request(commentsUrl(entryId)));

    const body = (await res.json()) as { data: Record<string, unknown>[] };
    const comment = body.data[0] ?? {};
    expect(comment).not.toHaveProperty("authorEmail");
    expect(comment).not.toHaveProperty("ipHash");
    expect(comment).not.toHaveProperty("userAgent");
    expect(comment).not.toHaveProperty("status");
    expect(comment).not.toHaveProperty("bodyMd");
  });

  test("returns only approved comments", async () => {
    const h = await restHarness();
    const entryId = await seedPost(h);
    const f = commentFactory.transient({ db: h.db });
    await f.create({ entryId, status: "approved", bodyMd: "shown" });
    await f.create({ entryId, status: "pending", bodyMd: "hidden-pending" });
    await f.create({ entryId, status: "spam", bodyMd: "hidden-spam" });

    const res = await h.dispatch(new Request(commentsUrl(entryId)));

    const body = (await res.json()) as Envelope;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.bodyHtml).toContain("shown");
  });

  test("paginates with page/per_page and links", async () => {
    const h = await restHarness();
    const entryId = await seedPost(h);
    const f = commentFactory.transient({ db: h.db });
    for (let i = 1; i <= 3; i++) {
      await f.create({ entryId, status: "approved", bodyMd: `c${String(i)}` });
    }

    const page1 = (await (
      await h.dispatch(new Request(commentsUrl(entryId, "?per_page=2&page=1")))
    ).json()) as Envelope;
    expect(page1.data).toHaveLength(2);
    expect(page1.links.next).toBeDefined();
    expect(page1.links.prev).toBeUndefined();

    const page2 = (await (
      await h.dispatch(new Request(commentsUrl(entryId, "?per_page=2&page=2")))
    ).json()) as Envelope;
    expect(page2.data).toHaveLength(1);
    expect(page2.links.prev).toBeDefined();
    expect(page2.links.next).toBeUndefined();
  });

  test("comments of an unpublished entry resolve to an empty page", async () => {
    const h = await restHarness();
    const entryId = await seedPost(h, { status: "draft" });
    await commentFactory
      .transient({ db: h.db })
      .create({ entryId, status: "approved", bodyMd: "hidden" });

    const res = await h.dispatch(new Request(commentsUrl(entryId)));

    expect(res.status).toBe(200);
    expect(((await res.json()) as Envelope).data).toEqual([]);
  });

  test("the resource appears in the generated openapi.json", async () => {
    const h = await restHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/_plumix/api/v1/openapi.json"),
    );

    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(doc.paths).toHaveProperty("/{type}/{id}/comments");
  });
});
