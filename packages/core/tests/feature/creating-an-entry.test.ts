import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { entry } from "../../src/hooks/entry.js";
import { testSite } from "../../src/test/site.js";

/**
 * No entry type is registered, so `post` reaches only core's built-in
 * `entry:post:*` capabilities.
 */
const site = await testSite({
  config: {
    roles: {
      // Writes posts but never publishes them.
      contributor: {
        can: {
          admin: ["access"],
          user: ["edit_own"],
          entry: { post: ["read", "create", "edit_own"] },
          term: { category: ["read", "assign"], tag: ["read", "assign"] },
        },
      },
    },
  },
});

const v2 = (blocks: readonly unknown[]) => ({
  version: "plumix.v2" as const,
  blocks,
});

describe("creating an entry", () => {
  test("a contributor creates a draft they author, with no publish date", async () => {
    const contributor = await site.factory.user.create({ role: "contributor" });

    const created = await site.actingAs(contributor).rpc.entry.create({
      title: "Hello",
      slug: "hello",
    });

    expect(created).toMatchObject({
      status: "draft",
      authorId: contributor.id,
      publishedAt: null,
    });
  });

  test("an omitted title is stored as empty on a draft", async () => {
    const created = await site
      .actingAs("author")
      .rpc.entry.create({ slug: "untitled-draft" });

    // Read surfaces render a localized "Untitled" fallback for the "" title.
    expect(created).toMatchObject({ title: "", status: "draft" });
  });

  test("an author schedules it for a future publish date", async () => {
    site.freezeTime("2026-03-01T09:00:00.000Z");

    const created = await site.actingAs("author").rpc.entry.create({
      title: "Later",
      slug: "later",
      status: "scheduled",
      publishedAt: new Date("2026-03-01T10:00:00.000Z"),
    });

    expect(created).toMatchObject({
      status: "scheduled",
      publishedAt: new Date("2026-03-01T10:00:00.000Z"),
    });
  });

  test("scheduling it without a publish date is refused", async () => {
    const create = site
      .actingAs("author")
      .rpc.entry.create({ title: "x", slug: "x", status: "scheduled" });

    await expect(create).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "scheduled_requires_future_date" },
    });
  });

  test("scheduling it for a past publish date is refused", async () => {
    site.freezeTime("2026-03-01T09:00:00.000Z");

    const create = site.actingAs("author").rpc.entry.create({
      title: "x",
      slug: "x",
      status: "scheduled",
      publishedAt: new Date("2026-03-01T08:59:59.000Z"),
    });

    await expect(create).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "scheduled_requires_future_date" },
    });
  });

  test("content holding an unknown block type is refused, naming the block", async () => {
    const create = site.actingAs("author").rpc.entry.create({
      title: "t",
      slug: "t",
      content: v2([
        { id: "p1", name: "core/rich-text", attrs: { body: "<p></p>" } },
        { id: "x1", name: "made-up/block", attrs: {} },
      ]),
    });

    await expect(create).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "unknown_block_type",
            nodeName: "made-up/block",
          }),
        ],
      },
    });
  });

  test("a member, who lacks post:create, is forbidden", async () => {
    const create = site
      .actingAs("member")
      .rpc.entry.create({ title: "t", slug: "s" });

    await expect(create).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:create" },
    });
  });

  test("a contributor publishing it directly is forbidden", async () => {
    const create = site.actingAs("contributor").rpc.entry.create({
      title: "now",
      slug: "now",
      status: "published",
    });

    await expect(create).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });

  test("a contributor scheduling it meets the same gate as publishing", async () => {
    const create = site.actingAs("contributor").rpc.entry.create({
      title: "later",
      slug: "later",
      status: "scheduled",
    });

    await expect(create).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });

  test("an author publishes it directly, stamping its publish date", async () => {
    const created = await site.actingAs("author").rpc.entry.create({
      title: "go",
      slug: "go",
      status: "published",
    });

    expect(created.status).toBe("published");
    expect(created.publishedAt).toBeInstanceOf(Date);
  });

  test("a slug another entry of the type holds is refused as a conflict", async () => {
    const author = site.actingAs("author");
    await author.rpc.entry.create({ title: "A", slug: "same" });

    const create = author.rpc.entry.create({ title: "B", slug: "same" });

    await expect(create).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("a draft announces no publish", async () => {
    await site.actingAs("author").rpc.entry.create({ title: "d", slug: "d-1" });

    site.events.assertNotEmitted(entry.published);
  });

  test("a published entry announces its publish once", async () => {
    await site.actingAs("author").rpc.entry.create({
      title: "p",
      slug: "p-1",
      status: "published",
    });

    expect(site.events.emitted(entry.published)).toHaveLength(1);
  });

  test("of two concurrent creates with one slug, exactly one wins and the other conflicts", async () => {
    const author = site.actingAs("author");

    const results = await Promise.allSettled([
      author.rpc.entry.create({ title: "A", slug: "race" }),
      author.rpc.entry.create({ title: "B", slug: "race" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toMatchObject([
      { reason: { code: "CONFLICT", data: { reason: "slug_taken" } } },
    ]);
  });

  test("stores the row, so a follow-up query returns it", async () => {
    const created = await site
      .actingAs("author")
      .rpc.entry.create({ title: "persist", slug: "persist" });

    const row = await site.context.db.query.entries.findFirst({
      where: eq(entries.id, created.id),
    });
    expect(row?.title).toBe("persist");
  });
});

describe("creating an entry under a parent", () => {
  test("a parent the caller cannot see answers an undistinguished not found", async () => {
    // Another user's draft: an author lacks post:edit_any and doesn't own it.
    const secret = await site.factory.draft.create({
      title: "hidden",
      slug: "hidden",
    });

    const create = site.actingAs("author").rpc.entry.create({
      title: "child",
      slug: "child",
      parentId: secret.id,
    });

    await expect(create).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: secret.id },
    });
  });

  test("a parent of a different entry type answers not found", async () => {
    const admin = await site.factory.admin.create();
    const page = await site.factory.published.create({
      type: "page",
      title: "p",
      slug: "p",
      authorId: admin.id,
    });

    // The implicit type "post" doesn't match the "page" parent.
    const create = site.actingAs(admin).rpc.entry.create({
      title: "child",
      slug: "child2",
      parentId: page.id,
    });

    await expect(create).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: page.id },
    });
  });

  test("a parent of the same type the caller can read is accepted", async () => {
    const admin = site.actingAs("admin");
    const parent = await admin.rpc.entry.create({
      title: "parent",
      slug: "parent",
      status: "published",
    });

    const child = await admin.rpc.entry.create({
      title: "child",
      slug: "child3",
      parentId: parent.id,
    });

    expect(child.parentId).toBe(parent.id);
  });
});

describe("creating an entry as a writer without edit_layout", () => {
  test("content holding a block is refused as a layout change", async () => {
    const create = site.actingAs("contributor").rpc.entry.create({
      title: "Hello",
      slug: "hello",
      content: v2([
        { id: "p1", name: "core/rich-text", attrs: { body: "<p>Hi</p>" } },
      ]),
    });

    await expect(create).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({ code: "layout_change", path: "blocks[0]" }),
        ],
      },
    });
  });

  test("an empty tree is created", async () => {
    const created = await site.actingAs("contributor").rpc.entry.create({
      title: "Hello",
      slug: "hello",
      content: v2([]),
    });

    expect(created.content).toEqual(v2([]));
  });
});
