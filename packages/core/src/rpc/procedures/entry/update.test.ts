import { describe, expect, test } from "vitest";

import { entries } from "../../../db/schema/entries.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.update", () => {
  test("author can update their own draft via edit_own", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "own",
    });
    const updated = await h.client.entry.update({
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
      h.client.entry.update({ id: mine.id, title: "hax" }),
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
      h.client.entry.update({ id: own.id, title: "x" }),
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
    const updated = await h.client.entry.update({
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

    const onPublish = h.spyAction("entry:published");
    const onTransition = h.spyAction("entry:transition");

    const updated = await h.client.entry.update({
      id: own.id,
      status: "published",
    });
    expect(updated.status).toBe("published");
    expect(updated.publishedAt).toBeInstanceOf(Date);
    onPublish.assertCalledOnce();
    onTransition.assertCalledOnce();
  });

  test("contributor cannot promote their own draft to published", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "solo",
    });
    await expect(
      h.client.entry.update({ id: own.id, status: "published" }),
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
      h.client.entry.update({ id: mine.id, slug: "taken" }),
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
    const onUpdate = h.spyAction("entry:updated");

    const returned = await h.client.entry.update({ id: own.id });
    expect(returned.id).toBe(own.id);
    onUpdate.assertNotCalled();
  });

  test("404 for a missing row", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.entry.update({ id: 9999, title: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("concurrent publish transitions: post:published fires exactly once", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "race-to-publish",
    });

    const onPublish = h.spyAction("entry:published");

    const outcomes = await Promise.all([
      h.client.entry.update({ id: own.id, status: "published" }),
      h.client.entry.update({ id: own.id, status: "published" }),
      h.client.entry.update({ id: own.id, status: "published" }),
    ]);
    for (const result of outcomes) expect(result.status).toBe("published");
    onPublish.assertCalledOnce();
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

    h.hooks.addFilter("entry:before_save", (post) => ({
      ...post,
      authorId: impostor.id,
      type: "leaked",
    }));

    const updated = await h.client.entry.update({
      id: own.id,
      title: "renamed",
    });
    expect(updated.authorId).toBe(h.user.id);
    expect(updated.type).toBe("post");
    expect(updated.title).toBe("renamed");
  });

  test("rejects reparenting under a post the caller cannot read", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const [own] = await h.db
      .insert(entries)
      .values({
        type: "post",
        title: "mine",
        slug: "mine",
        status: "draft",
        authorId: h.user.id,
      })
      .returning();
    if (!own) throw new Error("seed");

    const other = await h.factory.admin.create({
      email: "hidden@example.test",
    });
    const [secret] = await h.db
      .insert(entries)
      .values({
        type: "post",
        title: "secret",
        slug: "secret",
        status: "draft",
        authorId: other.id,
      })
      .returning();
    if (!secret) throw new Error("seed");

    await expect(
      h.client.entry.update({ id: own.id, parentId: secret.id }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "post", id: secret.id },
    });
  });

  test("rejects self-parenting as a CONFLICT (parent_cycle)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const p = await h.client.entry.create({
      title: "self",
      slug: "self",
      status: "published",
    });
    await expect(
      h.client.entry.update({ id: p.id, parentId: p.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("rejects a reparent that would form a depth-2 cycle (A→B→A)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const a = await h.client.entry.create({
      title: "a",
      slug: "a",
      status: "published",
    });
    const b = await h.client.entry.create({
      title: "b",
      slug: "b",
      status: "published",
      parentId: a.id,
    });
    // b→a already. Pointing a→b closes the cycle.
    await expect(
      h.client.entry.update({ id: a.id, parentId: b.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("rejects a reparent that would form a depth-3 cycle (A→B→C→A)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const a = await h.client.entry.create({
      title: "a2",
      slug: "a2",
      status: "published",
    });
    const b = await h.client.entry.create({
      title: "b2",
      slug: "b2",
      status: "published",
      parentId: a.id,
    });
    const c = await h.client.entry.create({
      title: "c2",
      slug: "c2",
      status: "published",
      parentId: b.id,
    });
    // c→b→a already. Pointing a→c closes the cycle a→c→b→a.
    await expect(
      h.client.entry.update({ id: a.id, parentId: c.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("meta: partial write leaves keys outside the patch untouched", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-seo", {
      id: "test-seo",
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        { key: "meta_title", label: "Meta title", type: "string", inputType: "text" },
        { key: "is_featured", label: "Featured", type: "boolean", inputType: "checkbox" },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({
      title: "p",
      slug: "p",
      meta: { meta_title: "seed title", is_featured: false },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { is_featured: true },
    });
    expect(updated.meta).toEqual({
      meta_title: "seed title",
      is_featured: true,
    });
  });

  test("meta: null value clears a key without touching the others", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-seo", {
      id: "test-seo",
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        { key: "meta_title", label: "Meta title", type: "string", inputType: "text" },
        { key: "is_featured", label: "Featured", type: "boolean", inputType: "checkbox" },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({
      title: "p2",
      slug: "p2",
      meta: { meta_title: "keep", is_featured: true },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { is_featured: null },
    });
    expect(updated.meta).toEqual({ meta_title: "keep" });
  });

  test("meta: bad key → CONFLICT, and the post row is untouched (validated pre-write)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const post = await h.client.entry.create({ title: "p3", slug: "p3" });
    await expect(
      h.client.entry.update({
        id: post.id,
        title: "new-title",
        meta: { bogus: "x" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "bogus" },
    });
    const reloaded = await h.client.entry.get({ id: post.id });
    expect(reloaded.title).toBe("p3");
  });

  test("rpc:entry.update:input can inject derived meta before sanitization; post:meta_changed fires with the final bag", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-derived", {
      id: "test-derived",
      label: "Derived",
      entryTypes: ["post"],
      fields: [
        { key: "title", label: "Title", type: "string", inputType: "text" },
        { key: "title_lc", label: "Title (lowercase)", type: "string", inputType: "text" },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    // Derived meta at the input stage: mirror `title` into `title_lc` on
    // every update. Replaces the old `rpc:entry.meta:write` filter —
    // plugins operate on the raw input before sanitization.
    h.hooks.addFilter("rpc:entry.update:input", (input) => {
      const title = input.meta?.title;
      if (typeof title !== "string") return input;
      return {
        ...input,
        meta: { ...input.meta, title_lc: title.toLowerCase() },
      };
    });
    const onUpdated = h.spyAction("entry:meta_changed");

    const post = await h.client.entry.create({ title: "p", slug: "p" });
    await h.client.entry.update({
      id: post.id,
      meta: { title: "SHOUTING" },
    });

    const reloaded = await h.client.entry.get({ id: post.id });
    expect(reloaded.meta).toEqual({
      title: "SHOUTING",
      title_lc: "shouting",
    });
    onUpdated.assertCalledOnce();
    expect(onUpdated.lastArgs?.[1]).toEqual({
      set: { title: "SHOUTING", title_lc: "shouting" },
      removed: [],
    });
  });

  test("rpc:entry.get:output can decorate the returned meta bag without touching storage", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-title", {
      id: "test-title",
      label: "Title",
      entryTypes: ["post"],
      fields: [
        { key: "title", label: "Title", type: "string", inputType: "text" },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    // Decorate-on-read: inject a derived key into every response. Replaces
    // the old `rpc:entry.meta:read` filter — plugins subscribe to the
    // post-level output filter (or all three: create/update/get) and
    // mutate `output.meta`.
    h.hooks.addFilter("rpc:entry.get:output", (output) => ({
      ...output,
      meta: { ...output.meta, _derived: "always-there" },
    }));

    const post = await h.client.entry.create({
      title: "p",
      slug: "p",
      meta: { title: "stored" },
    });
    // create:output filter wasn't installed → bag is unadorned.
    expect(post.meta).toEqual({ title: "stored" });

    const refetched = await h.client.entry.get({ id: post.id });
    expect(refetched.meta).toEqual({
      title: "stored",
      _derived: "always-there",
    });
  });
});
