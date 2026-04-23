import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.create", () => {
  test("contributor can create a draft", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const created = await h.client.entry.create({
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
      h.client.entry.create({ title: "t", slug: "s" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:create" },
    });
  });

  test("forbidden when contributor tries to publish directly", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    await expect(
      h.client.entry.create({
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
      h.client.entry.create({
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
    h.hooks.addFilter("entry:before_save", (post) => ({
      ...post,
      authorId: other.id,
    }));
    const created = await h.client.entry.create({
      title: "t",
      slug: "guarded",
    });
    expect(created.authorId).toBe(h.user.id);
  });

  test("author can publish directly and publishedAt is stamped", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.entry.create({
      title: "go",
      slug: "go",
      status: "published",
    });
    expect(created.status).toBe("published");
    expect(created.publishedAt).toBeInstanceOf(Date);
  });

  test("slug collision within the same type returns CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    await h.client.entry.create({ title: "A", slug: "same" });
    await expect(
      h.client.entry.create({ title: "B", slug: "same" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("rpc:entry.create:input filter can rewrite the input before persistence", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    h.hooks.addFilter("rpc:entry.create:input", (input) => ({
      ...input,
      title: `[pinned] ${input.title}`,
    }));

    const created = await h.client.entry.create({
      title: "orig",
      slug: "orig",
    });
    expect(created.title).toBe("[pinned] orig");
  });

  test("post:before_save filter runs before the insert", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    h.hooks.addFilter("entry:before_save", (post) => ({
      ...post,
      excerpt: `[auto] ${post.title}`,
    }));

    const created = await h.client.entry.create({
      title: "t",
      slug: "t-slug",
    });
    expect(created.excerpt).toBe("[auto] t");
  });

  test("post:published fires once when status is published, never on drafts", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const onPublish = h.spyAction("entry:published");

    await h.client.entry.create({ title: "d", slug: "d-1" });
    onPublish.assertNotCalled();

    await h.client.entry.create({
      title: "p",
      slug: "p-1",
      status: "published",
    });
    onPublish.assertCalledOnce();
  });

  test("concurrent creates with the same slug: exactly one wins, the other gets CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const results = await Promise.allSettled([
      h.client.entry.create({ title: "A", slug: "race" }),
      h.client.entry.create({ title: "B", slug: "race" }),
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
    const created = await h.client.entry.create({
      title: "persist",
      slug: "persist",
    });
    const row = await h.db.query.entries.findFirst({
      where: eq(entries.id, created.id),
    });
    expect(row?.title).toBe("persist");
  });

  test("rejects a parentId the caller cannot see (undistinguished 404)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    // Another author's draft — contributor lacks post:edit_any, doesn't own it.
    const other = await h.factory.admin.create({ email: "a@example.test" });
    const [secret] = await h.db
      .insert(entries)
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
      h.client.entry.create({
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
      .insert(entries)
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
      h.client.entry.create({
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
    const parent = await h.client.entry.create({
      title: "parent",
      slug: "parent",
      status: "published",
    });
    const child = await h.client.entry.create({
      title: "child",
      slug: "child3",
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });

  test("meta: registered keys persist and come back on the create response", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-seo", {
      id: "test-seo",
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        {
          key: "meta_title",
          label: "Meta title",
          type: "string",
          inputType: "text",
        },
        {
          key: "is_featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const created = await h.client.entry.create({
      title: "with-meta",
      slug: "with-meta",
      meta: { meta_title: "SEO title", is_featured: true },
    });
    expect(created.meta).toEqual({
      meta_title: "SEO title",
      is_featured: true,
    });
  });

  test("meta: unregistered key → CONFLICT with the offending key surfaced", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.entry.create({
        title: "bad-meta",
        slug: "bad-meta",
        meta: { mystery: "x" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "mystery" },
    });
  });

  test("meta: input schema caps the map at 200 keys (DoS guard)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const oversized: Record<string, string> = {};
    for (let i = 0; i < 201; i++) oversized[`k${i}`] = "x";
    await expect(
      h.client.entry.create({
        title: "too-much",
        slug: "too-much",
        meta: oversized,
      }),
    ).rejects.toMatchObject({
      // oRPC's valibot adapter surfaces a `BAD_REQUEST` for schema failures,
      // so we match on the code, not a CONFLICT reason — the cap is a wire
      // validation check, not a sanitizer rejection.
      code: "BAD_REQUEST",
    });
  });
});
