import { describe, expect, test, vi } from "vitest";

import { eq } from "../../../db/index.js";
import { posts } from "../../../db/schema/posts.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("post.create", () => {
  test("contributor can create a draft", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const created = await h.client.post.create({
      title: "Hello",
      slug: "hello",
    });
    expect(created.status).toBe("draft");
    expect(created.authorId).toBe(h.user.id);
    expect(created.publishedAt).toBeNull();
  });

  test("forbidden for a subscriber (no post:create)", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await expect(
      h.client.post.create({ title: "t", slug: "s" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:create" },
    });
  });

  test("forbidden when contributor tries to publish directly", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    await expect(
      h.client.post.create({
        title: "now",
        slug: "now",
        status: "published",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:publish" },
    });
  });

  test("forbidden when contributor tries to schedule — same gate as publish", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    await expect(
      h.client.post.create({
        title: "later",
        slug: "later",
        status: "scheduled",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:publish" },
    });
  });

  test("post:before_save cannot overwrite authorId at create", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const other = await h.factory.admin.create({
      email: "other@example.test",
    });
    h.hooks.addFilter("post:before_save", (post) => ({
      ...post,
      authorId: other.id,
    }));
    const created = await h.client.post.create({
      title: "t",
      slug: "guarded",
    });
    expect(created.authorId).toBe(h.user.id);
  });

  test("author can publish directly and publishedAt is stamped", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.post.create({
      title: "go",
      slug: "go",
      status: "published",
    });
    expect(created.status).toBe("published");
    expect(created.publishedAt).toBeInstanceOf(Date);
  });

  test("slug collision within the same type returns CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    await h.client.post.create({ title: "A", slug: "same" });
    await expect(
      h.client.post.create({ title: "B", slug: "same" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("rpc:post.create:input filter can rewrite the input before persistence", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    h.hooks.addFilter("rpc:post.create:input", (input) => ({
      ...input,
      title: `[pinned] ${input.title}`,
    }));

    const created = await h.client.post.create({
      title: "orig",
      slug: "orig",
    });
    expect(created.title).toBe("[pinned] orig");
  });

  test("post:before_save filter runs before the insert", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    h.hooks.addFilter("post:before_save", (post) => ({
      ...post,
      excerpt: `[auto] ${post.title}`,
    }));

    const created = await h.client.post.create({
      title: "t",
      slug: "t-slug",
    });
    expect(created.excerpt).toBe("[auto] t");
  });

  test("post:published fires once when status is published, never on drafts", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const onPublish = vi.fn();
    h.hooks.addAction("post:published", onPublish);

    await h.client.post.create({ title: "d", slug: "d-1" });
    expect(onPublish).not.toHaveBeenCalled();

    await h.client.post.create({
      title: "p",
      slug: "p-1",
      status: "published",
    });
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  test("concurrent creates with the same slug: exactly one wins, the other gets CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const results = await Promise.allSettled([
      h.client.post.create({ title: "A", slug: "race" }),
      h.client.post.create({ title: "B", slug: "race" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const [failure] = rejected;
    expect(failure?.reason).toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("persists the row so a follow-up query returns it", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.post.create({
      title: "persist",
      slug: "persist",
    });
    const row = await h.db.query.posts.findFirst({
      where: eq(posts.id, created.id),
    });
    expect(row?.title).toBe("persist");
  });

  test("rejects a parentId the caller cannot see (undistinguished 404)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    // Another author's draft — contributor lacks post:edit_any, doesn't own it.
    const other = await h.factory.admin.create({ email: "a@example.test" });
    const [secret] = await h.db
      .insert(posts)
      .values({
        type: "post",
        title: "hidden",
        slug: "hidden",
        status: "draft",
        authorId: other.id,
      })
      .returning();
    if (!secret) throw new Error("seed");

    await expect(
      h.client.post.create({
        title: "child",
        slug: "child",
        parentId: secret.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "post", id: secret.id },
    });
  });

  test("rejects a parentId of a different post type", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const [page] = await h.db
      .insert(posts)
      .values({
        type: "page",
        title: "p",
        slug: "p",
        status: "published",
        authorId: h.user.id,
        publishedAt: new Date(),
      })
      .returning();
    if (!page) throw new Error("seed");

    await expect(
      h.client.post.create({
        // implicit type "post" — mismatched with the "page" parent
        title: "child",
        slug: "child2",
        parentId: page.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "post", id: page.id },
    });
  });

  test("accepts a parentId the caller can read (same type, readable)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const parent = await h.client.post.create({
      title: "parent",
      slug: "parent",
      status: "published",
    });
    const child = await h.client.post.create({
      title: "child",
      slug: "child3",
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });
});
