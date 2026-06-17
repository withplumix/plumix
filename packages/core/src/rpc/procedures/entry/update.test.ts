import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

// SEO meta box fixture used by the partial-write and null-clear tests.
// Registers two fields on the `post` entry type so each test can flip
// one without disturbing the other.
function registerSeoMetaBox(
  plugins: ReturnType<typeof createPluginRegistry>,
): void {
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
}

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
      data: { capability: "entry:post:edit_any" },
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
      data: { capability: "entry:post:edit_any" },
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

  test("scheduling a draft stores the future publishedAt and keeps status scheduled", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "to-schedule",
    });
    const when = new Date(Math.floor((Date.now() + 3_600_000) / 1000) * 1000);

    const updated = await h.client.entry.update({
      id: own.id,
      status: "scheduled",
      publishedAt: when,
    });

    expect(updated.status).toBe("scheduled");
    expect(updated.publishedAt).toEqual(when);
  });

  test("scheduling a draft without a publishedAt is rejected", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "no-date",
    });

    await expect(
      h.client.entry.update({ id: own.id, status: "scheduled" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "scheduled_requires_future_date" },
    });
  });

  test("editing a past-due scheduled entry (awaiting the cron) is not rejected", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    // Seed directly: a row scheduled for a moment that's already passed,
    // still `scheduled` because the cron hasn't fired yet.
    const due = await h.factory.entry.create({
      authorId: h.user.id,
      slug: "due",
      status: "scheduled",
      publishedAt: new Date(Date.now() - 1000),
    });

    const updated = await h.client.entry.update({
      id: due.id,
      title: "fixed a typo",
    });

    expect(updated.title).toBe("fixed a typo");
    expect(updated.status).toBe("scheduled");
  });

  test("manually publishing a future-scheduled entry resets publishedAt to now", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const tomorrow = new Date(Date.now() + 86_400_000);
    const scheduled = await h.factory.entry.create({
      authorId: h.user.id,
      slug: "early",
      status: "scheduled",
      publishedAt: tomorrow,
    });

    const updated = await h.client.entry.update({
      id: scheduled.id,
      status: "published",
    });

    expect(updated.status).toBe("published");
    // Stamped ~now, not the original future date.
    expect(updated.publishedAt?.getTime()).toBeLessThan(tomorrow.getTime());
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
      data: { capability: "entry:post:publish" },
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

  test("empty patch is a no-op and does not fire entry:updated", async () => {
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

  test("concurrent publish transitions: entry:published fires exactly once", async () => {
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

  test("entry:before_save cannot overwrite immutable fields", async () => {
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
    const own = await h.factory.draft.create({
      title: "mine",
      slug: "mine",
      authorId: h.user.id,
    });

    const other = await h.factory.admin.create({
      email: "hidden@example.test",
    });
    const secret = await h.factory.draft.create({
      title: "secret",
      slug: "secret",
      authorId: other.id,
    });

    await expect(
      h.client.entry.update({ id: own.id, parentId: secret.id }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: secret.id },
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
    registerSeoMetaBox(plugins);
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
    registerSeoMetaBox(plugins);
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

  test("rpc:entry.update:input can inject derived meta before sanitization; entry:meta_changed fires with the final bag", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-derived", {
      id: "test-derived",
      label: "Derived",
      entryTypes: ["post"],
      fields: [
        { key: "title", label: "Title", type: "string", inputType: "text" },
        {
          key: "title_lc",
          label: "Title (lowercase)",
          type: "string",
          inputType: "text",
        },
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

  describe("optimistic concurrency (expectedLiveUpdatedAt)", () => {
    test("matching token: update succeeds", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-match",
      });
      const loaded = await h.client.entry.get({ id: own.id });
      const updated = await h.client.entry.update({
        id: own.id,
        title: "renamed",
        expectedLiveUpdatedAt: loaded.updatedAt,
      });
      expect(updated.title).toBe("renamed");
    });

    test("stale token: rejects with CONFLICT { stale_expected_updated_at }", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-stale",
      });
      await expect(
        h.client.entry.update({
          id: own.id,
          title: "lost-race",
          expectedLiveUpdatedAt: new Date("2020-01-01T00:00:00Z"),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "stale_expected_updated_at" },
      });
    });

    test("absent token: preserves legacy last-write-wins behavior", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-legacy",
      });
      const updated = await h.client.entry.update({
        id: own.id,
        title: "no-token",
      });
      expect(updated.title).toBe("no-token");
    });

    test("stale token + empty patch: still CONFLICT (no short-circuit bypass)", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-empty",
      });
      await expect(
        h.client.entry.update({
          id: own.id,
          expectedLiveUpdatedAt: new Date("2020-01-01T00:00:00Z"),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "stale_expected_updated_at" },
      });
    });

    test("unauthorised caller with stale token still gets FORBIDDEN (no CONFLICT oracle)", async () => {
      const h = await createRpcHarness({ authAs: "subscriber" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-no-oracle",
      });
      await expect(
        h.client.entry.update({
          id: own.id,
          title: "x",
          expectedLiveUpdatedAt: new Date("2020-01-01T00:00:00Z"),
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { capability: "entry:post:edit_any" },
      });
    });
  });

  // Round-trip implies the v2 branch was taken: the v1 validator would
  // reject this envelope at the root (`Content root must be a Tiptap doc
  // node`), so a successful update + content match proves the dispatch in
  // `assertContentValidAgainstRegistries`.
  test("persists a plumix.v2 content envelope through entry.update", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "v2-write",
    });
    const v2Content = {
      version: "plumix.v2",
      blocks: [
        { id: "p1", name: "core/rich-text", attrs: { body: "<p>Hello</p>" } },
      ],
    };
    const updated = await h.client.entry.update({
      id: own.id,
      content: v2Content,
    });
    expect(updated.content).toEqual(v2Content);
  });

  test("rejects writing a capability-gated meta field with FORBIDDEN", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-gated", {
      id: "test-gated",
      label: "Gated",
      entryTypes: ["post"],
      fields: [
        {
          key: "private_note",
          label: "Private note",
          type: "string",
          inputType: "text",
          capability: "view_private_notes",
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "author", plugins });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "gated-field",
    });
    await expect(
      h.client.entry.update({
        id: own.id,
        meta: { private_note: "leaked" },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "view_private_notes" },
    });
  });
});
