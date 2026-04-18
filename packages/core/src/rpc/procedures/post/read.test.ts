import { describe, expect, test } from "vitest";

import { createRpcHarness } from "../../../test/rpc.js";

describe("post.list", () => {
  test("returns published posts by default for subscriber", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub-1" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft-1" });

    const rows = await h.client.post.list({});
    expect(rows).toEqual([expect.objectContaining({ slug: "pub-1" })]);
  });

  test("editor can see drafts by status filter", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub-2" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft-2" });

    const rows = await h.client.post.list({ status: "draft" });
    expect(rows).toEqual([expect.objectContaining({ slug: "draft-2" })]);
  });

  test("subscriber asking for drafts gets an empty list, not a 403", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "secret" });

    const rows = await h.client.post.list({ status: "draft" });
    expect(rows).toEqual([]);
  });

  test("honours pagination (limit + offset)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.post.createList(5, { authorId: h.user.id });

    const page1 = await h.client.post.list({ limit: 2, offset: 0 });
    const page2 = await h.client.post.list({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    const [firstOfPage1] = page1;
    const [firstOfPage2] = page2;
    expect(firstOfPage1?.id).not.toBe(firstOfPage2?.id);
  });

  test("forbidden for a non-registered post type", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.post.list({ type: "unknown_type" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "unknown_type:read" },
    });
  });

  test("parentId=null returns only top-level posts", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const root = await h.factory.published.create({
      authorId: h.user.id,
      slug: "root-page",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "child-page",
      parentId: root.id,
    });

    const top = await h.client.post.list({ parentId: null });
    expect(top.map((p) => p.slug)).toEqual(["root-page"]);
  });

  test("parentId=<id> returns only direct children of that post", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const root = await h.factory.published.create({
      authorId: h.user.id,
      slug: "parent",
    });
    const child = await h.factory.published.create({
      authorId: h.user.id,
      slug: "child",
      parentId: root.id,
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "unrelated",
    });

    const children = await h.client.post.list({ parentId: root.id });
    expect(children.map((p) => p.id)).toEqual([child.id]);
  });

  test("omitted parentId returns a flat list across depths", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const root = await h.factory.published.create({
      authorId: h.user.id,
      slug: "p-root",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "p-child",
      parentId: root.id,
    });

    const all = await h.client.post.list({});
    expect(all.map((p) => p.slug).sort()).toEqual(["p-child", "p-root"]);
  });
});

describe("post.get", () => {
  test("returns the row when published", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const post = await h.factory.published.create({ authorId: h.user.id });
    const got = await h.client.post.get({ id: post.id });
    expect(got.id).toBe(post.id);
  });

  test("404 when the row does not exist", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.post.get({ id: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("404 (not 403) when a subscriber targets a draft — existence is hidden", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const other = await h.factory.author.create();
    const hidden = await h.factory.draft.create({
      authorId: other.id,
      slug: "hidden",
    });
    await expect(h.client.post.get({ id: hidden.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("author can fetch their own draft when they have edit_own", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const mine = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "my-draft",
    });
    const got = await h.client.post.get({ id: mine.id });
    expect(got.status).toBe("draft");
  });

  test("editor can fetch anyone's draft", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.author.create();
    const theirs = await h.factory.draft.create({
      authorId: other.id,
      slug: "others-draft",
    });
    const got = await h.client.post.get({ id: theirs.id });
    expect(got.id).toBe(theirs.id);
  });
});
