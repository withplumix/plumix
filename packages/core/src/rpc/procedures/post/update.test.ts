import { describe, expect, test, vi } from "vitest";

import { createRpcHarness } from "../../../test/rpc.js";

describe("post.update", () => {
  test("author can update their own draft via edit_own", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "own",
    });
    const updated = await h.client.post.update({
      id: own.id,
      title: "renamed",
    });
    expect(updated.title).toBe("renamed");
  });

  test("contributor cannot edit someone else's draft — FORBIDDEN reports the stronger cap (no authorship probe)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const other = await h.factory.author.create();
    const mine = await h.factory.draft.create({
      authorId: other.id,
      slug: "theirs",
    });
    await expect(
      h.client.post.update({ id: mine.id, title: "hax" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:edit_any" },
    });
  });

  test("subscriber editing own draft is also told edit_any (no authorship oracle)", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "self",
    });
    await expect(
      h.client.post.update({ id: own.id, title: "x" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:edit_any" },
    });
  });

  test("editor can edit anyone's draft", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.author.create();
    const theirs = await h.factory.draft.create({
      authorId: other.id,
      slug: "theirs",
    });
    const updated = await h.client.post.update({
      id: theirs.id,
      title: "by-editor",
    });
    expect(updated.title).toBe("by-editor");
  });

  test("promoting draft → published stamps publishedAt and fires both actions", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "promote",
    });

    const onPublish = vi.fn();
    const onTransition = vi.fn();
    h.hooks.addAction("post:published", onPublish);
    h.hooks.addAction("post:transition", onTransition);

    const updated = await h.client.post.update({
      id: own.id,
      status: "published",
    });
    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toBeInstanceOf(Date);
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onTransition).toHaveBeenCalledTimes(1);
  });

  test("contributor cannot promote their own draft to published", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "solo",
    });
    await expect(
      h.client.post.update({ id: own.id, status: "published" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "post:publish" },
    });
  });

  test("slug collision with another post of the same type returns CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "taken" });
    const mine = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "mine",
    });
    await expect(
      h.client.post.update({ id: mine.id, slug: "taken" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("empty patch is a no-op and does not fire post:updated", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "noop",
    });
    const onUpdate = vi.fn();
    h.hooks.addAction("post:updated", onUpdate);

    const returned = await h.client.post.update({ id: own.id });
    expect(returned.id).toBe(own.id);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("404 for a missing row", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.post.update({ id: 9999, title: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("concurrent publish transitions: post:published fires exactly once", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "race-to-publish",
    });

    const onPublish = vi.fn();
    h.hooks.addAction("post:published", onPublish);

    const outcomes = await Promise.all([
      h.client.post.update({ id: own.id, status: "published" }),
      h.client.post.update({ id: own.id, status: "published" }),
      h.client.post.update({ id: own.id, status: "published" }),
    ]);
    for (const result of outcomes) expect(result.status).toBe("published");
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  test("post:before_save cannot overwrite immutable fields", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const impostor = await h.factory.admin.create({
      email: "impostor@example.test",
    });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "locked",
    });

    h.hooks.addFilter("post:before_save", (post) => ({
      ...post,
      authorId: impostor.id,
      type: "leaked",
    }));

    const updated = await h.client.post.update({
      id: own.id,
      title: "renamed",
    });
    expect(updated.authorId).toBe(h.user.id);
    expect(updated.type).toBe("post");
    expect(updated.title).toBe("renamed");
  });
});
