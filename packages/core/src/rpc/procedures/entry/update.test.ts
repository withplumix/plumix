import { describe, expect, test, vi } from "vitest";

import { entryCapability } from "../../../access/contract/capability.js";
import { ACCESS_POLICY_META_KEY } from "../../../access/contract/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
} from "../../../access/policy.js";
import { etagOf } from "../../../db/concurrency.js";
import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { entryChanges } from "../../../db/schema/entry_changes.js";
import { definePlugin } from "../../../plugin/define.js";
import { text } from "../../../plugin/fields/builder.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { toRegisteredEntryType } from "../../../plugin/registry.js";
import { upsertAutosave } from "../../../revisions/repository.js";
import { NAMED_TEMPLATE_META_KEY } from "../../../route/render/template-builders.js";
import { defaultTestTheme } from "../../../test/default-theme.js";
import { currentEtag } from "../../../test/entry-etag.js";
import { editorUser } from "../../../test/factories.js";
import { pooledEntryTypeRegistry } from "../../../test/pooled-entry-types.js";
import { createRpcHarness } from "../../../test/rpc.js";

/**
 * Register a `post` entry type carrying a selectable per-entry access space, so
 * the update handler validates a caller's `access` key against it.
 */
function registerPostAccess(
  plugins: ReturnType<typeof createPluginRegistry>,
): void {
  plugins.entryTypes.set(
    "post",
    toRegisteredEntryType(
      "post",
      {
        label: "Posts",
        access: {
          default: anonymousPolicy,
          policies: [
            {
              key: "members",
              label: "Members only",
              policy: authenticatedPolicy,
            },
          ],
        },
      },
      null,
    ),
  );
}

/**
 * SEO meta box fixture used by the partial-write and null-clear tests.
 * Registers two fields on the `post` entry type so each test can flip
 * one without disturbing the other.
 */
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

function registerRequiredSubtitle(
  plugins: ReturnType<typeof createPluginRegistry>,
): void {
  plugins.entryMetaBoxes.set("required-box", {
    id: "required-box",
    label: "Article",
    entryTypes: ["post"],
    fields: [
      {
        key: "subtitle",
        label: "Subtitle",
        type: "string",
        inputType: "text",
        required: true,
      },
    ],
    registeredBy: "test",
  });
}

/**
 * `video_url` is required only while `layout` is "video" — the smallest shape
 * in which one key's value decides whether another key is required.
 */
function registerVideoLayout(
  plugins: ReturnType<typeof createPluginRegistry>,
): void {
  plugins.entryMetaBoxes.set("layout-box", {
    id: "layout-box",
    label: "Layout",
    entryTypes: ["post"],
    fields: [
      { key: "layout", label: "Layout", type: "string", inputType: "text" },
      {
        key: "video_url",
        label: "Video",
        type: "string",
        inputType: "text",
        required: true,
        visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
      },
    ],
    registeredBy: "test",
  });
}

describe("entry.update", () => {
  test("editor can update a type pooled onto post's capabilities", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: await pooledEntryTypeRegistry(),
    });
    const row = await h.factory.draft.create({
      authorId: h.user.id,
      type: "news",
      slug: "news-draft",
    });
    const updated = await h.client.entry.update({
      id: row.id,
      title: "renamed",
      ifMatch: await currentEtag(h.db, row.id),
    });
    expect(updated.title).toBe("renamed");
  });

  test("meta: a field gated by a reference is gated under the namespace its type pools into", async () => {
    const desk = definePlugin("desk", {
      setup: (ctx) => {
        ctx.registerEntryMetaBox("desk", {
          label: "Desk",
          entryTypes: ["news"],
          fields: [text("desk").capability(entryCapability("news", "publish"))],
        });
      },
    });
    const plugins = await pooledEntryTypeRegistry(desk);
    const editDesk = async (authAs: "contributor" | "author") => {
      const h = await createRpcHarness({ authAs, plugins });
      const row = await h.factory.draft.create({
        authorId: h.user.id,
        type: "news",
        slug: "news-desk",
      });
      return h.client.entry.update({
        id: row.id,
        meta: { desk: "city" },
        ifMatch: await currentEtag(h.db, row.id),
      });
    };

    await expect(editDesk("contributor")).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
    expect((await editDesk("author")).meta.desk).toBe("city");
  });

  test("contributor edits their own draft of a pooled type via entry:post:edit_own, not another's", async () => {
    const h = await createRpcHarness({
      authAs: "contributor",
      plugins: await pooledEntryTypeRegistry(),
    });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      type: "news",
      slug: "news-own",
    });
    const other = await h.factory.author.create();
    const theirs = await h.factory.draft.create({
      authorId: other.id,
      type: "news",
      slug: "news-theirs",
    });

    const updated = await h.client.entry.update({
      id: own.id,
      title: "mine",
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(updated.title).toBe("mine");
    await expect(
      h.client.entry.update({
        id: theirs.id,
        title: "hax",
        ifMatch: await currentEtag(h.db, theirs.id),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("author can update their own draft via edit_own", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "own",
    });
    const updated = await h.client.entry.update({
      id: own.id,
      title: "renamed",
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(updated.title).toBe("renamed");
  });

  test("an empty title clears it (entries may be untitled)", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "clears",
      title: "Has a title",
    });
    const updated = await h.client.entry.update({
      id: own.id,
      title: "",
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(updated.title).toBe("");
  });

  test("contributor cannot edit someone else's draft — FORBIDDEN reports the stronger cap (no authorship probe)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const other = await h.factory.author.create();
    const mine = await h.factory.draft.create({
      authorId: other.id,
      slug: "theirs",
    });
    await expect(
      h.client.entry.update({
        id: mine.id,
        title: "hax",
        ifMatch: await currentEtag(h.db, mine.id),
      }),
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
      h.client.entry.update({
        id: own.id,
        title: "x",
        ifMatch: await currentEtag(h.db, own.id),
      }),
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
      ifMatch: await currentEtag(h.db, theirs.id),
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
      ifMatch: await currentEtag(h.db, own.id),
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
      ifMatch: await currentEtag(h.db, own.id),
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
      h.client.entry.update({
        id: own.id,
        status: "scheduled",
        ifMatch: await currentEtag(h.db, own.id),
      }),
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
      ifMatch: await currentEtag(h.db, due.id),
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
      ifMatch: await currentEtag(h.db, scheduled.id),
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
      h.client.entry.update({
        id: own.id,
        status: "published",
        ifMatch: await currentEtag(h.db, own.id),
      }),
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
      h.client.entry.update({
        id: mine.id,
        slug: "taken",
        ifMatch: await currentEtag(h.db, mine.id),
      }),
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

    const returned = await h.client.entry.update({
      id: own.id,
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(returned.id).toBe(own.id);
    onUpdate.assertNotCalled();
  });

  test("404 for a missing row", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.entry.update({
        id: 9999,
        title: "x",
        ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("concurrent publish transitions from one copy: one publishes, entry:published fires once", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "race-to-publish",
    });
    const ifMatch = etagOf(own.updatedAt);
    const onPublish = h.spyAction("entry:published");

    const outcomes = await Promise.allSettled([
      h.client.entry.update({ id: own.id, status: "published", ifMatch }),
      h.client.entry.update({ id: own.id, status: "published", ifMatch }),
      h.client.entry.update({ id: own.id, status: "published", ifMatch }),
    ]);

    expect(outcomes.map((o) => o.status).sort()).toEqual([
      "fulfilled",
      "rejected",
      "rejected",
    ]);
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
      ifMatch: await currentEtag(h.db, own.id),
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
      h.client.entry.update({
        id: own.id,
        parentId: secret.id,
        ifMatch: await currentEtag(h.db, own.id),
      }),
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
      h.client.entry.update({
        id: p.id,
        parentId: p.id,
        ifMatch: await currentEtag(h.db, p.id),
      }),
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
      h.client.entry.update({
        id: a.id,
        parentId: b.id,
        ifMatch: await currentEtag(h.db, a.id),
      }),
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
      h.client.entry.update({
        id: a.id,
        parentId: c.id,
        ifMatch: await currentEtag(h.db, a.id),
      }),
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
      ifMatch: await currentEtag(h.db, post.id),
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
      ifMatch: await currentEtag(h.db, post.id),
    });
    expect(updated.meta).toEqual({ meta_title: "keep" });
  });

  test("meta: editing a draft is lenient — an empty required field is kept", async () => {
    const plugins = createPluginRegistry();
    registerRequiredSubtitle(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const draft = await h.factory.draft.create({ authorId: h.user.id });
    // A draft edit tolerates the empty required field so authoring never
    // stalls; the value is stored as-is.
    const updated = await h.client.entry.update({
      id: draft.id,
      meta: { subtitle: "" },
      ifMatch: await currentEtag(h.db, draft.id),
    });
    expect(updated.meta.subtitle).toBe("");
  });

  test("meta: publishing a draft enforces a required field it left empty", async () => {
    const plugins = createPluginRegistry();
    registerRequiredSubtitle(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const draft = await h.factory.draft.create({ authorId: h.user.id });
    await h.client.entry.update({
      id: draft.id,
      meta: { subtitle: "" },
      ifMatch: await currentEtag(h.db, draft.id),
    });
    // The publish transition strict-validates the full stored bag, so the
    // required field the draft left empty blocks the transition even though
    // this patch carries no meta.
    await expect(
      h.client.entry.update({
        id: draft.id,
        status: "published",
        ifMatch: await currentEtag(h.db, draft.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value" },
    });
  });

  // Strict edits validate only their own keys so older drift can't block them,
  // but switching a driver on makes its dependent required: that drift is this
  // edit's.
  test("meta: a live edit that switches a required field visible without it is rejected", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "standard" },
    });

    await expect(
      h.client.entry.update({
        id: post.id,
        meta: { layout: "video" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  test("meta: the same edit on a scheduled entry is rejected before the cron can publish it", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const scheduled = await h.factory.entry.create({
      authorId: h.user.id,
      status: "scheduled",
      publishedAt: new Date(Date.now() + 3_600_000),
      meta: { layout: "standard" },
    });

    await expect(
      h.client.entry.update({
        id: scheduled.id,
        meta: { layout: "video" },
        ifMatch: await currentEtag(h.db, scheduled.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  test("meta: switching a field visible is accepted when the edit supplies it", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "standard" },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { layout: "video", video_url: "https://example.com/v" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta.video_url).toBe("https://example.com/v");
  });

  // Visibility is judged against the row as it will be, so a hidden field is
  // dropped from the write rather than validated, as the publish gate does.
  test("meta: an edit to a field the stored driver hides is accepted and leaves it alone", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "standard", video_url: "https://example.com/old" },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { video_url: "" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta.video_url).toBe("https://example.com/old");
  });

  test("meta: clearing a field the stored driver shows is still rejected", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "video", video_url: "https://example.com/v" },
    });

    await expect(
      h.client.entry.update({
        id: post.id,
        meta: { video_url: "" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // Drift the edit neither caused nor re-conditioned must not block it, even
  // when the edit re-sends a driver at its current value.
  test("meta: an edit that does not change a driver is not blocked by its dependent's older drift", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      // Already invalid: written before `video_url` was required.
      meta: { layout: "video" },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      title: "fixed a typo",
      meta: { layout: "video" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.title).toBe("fixed a typo");
  });

  // Defaults are written at creation, not filled on read, so a row predating
  // the default lacks the driver, and conditions judge what is stored.
  test("meta: a driver storage lacks is not stood in for by its default", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("layout-box", {
      id: "layout-box",
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        {
          key: "layout",
          label: "Layout",
          type: "string",
          inputType: "text",
          default: "video",
        },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: {},
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { video_url: "https://example.com/v" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta).toEqual({});
  });

  // The publish gate judges storage, and a default on an existing row isn't
  // storage, so a required field resting on its default is still missing.
  test("meta: a required field the edit switches visible is not satisfied by its default", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("layout-box", {
      id: "layout-box",
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        { key: "layout", label: "Layout", type: "string", inputType: "text" },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          default: "https://example.com/default",
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "standard" },
    });

    await expect(
      h.client.entry.update({
        id: post.id,
        meta: { layout: "video" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // A driver never stored reads as absent, default or not, so sending it at
  // its default switches its dependent visible like any other value.
  test("meta: sending a driver storage lacks at its default is a change", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("layout-box", {
      id: "layout-box",
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        {
          key: "layout",
          label: "Layout",
          type: "string",
          inputType: "text",
          default: "video",
        },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    // Already invalid: written before `video_url` was required.
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: {},
    });

    await expect(
      h.client.entry.update({
        id: post.id,
        title: "fixed a typo",
        meta: { layout: "video" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // The publish gate sees a field the way the editor does, and both read
  // storage alone: `layout` is absent, so `video_url` is hidden and not
  // demanded.
  test("meta: publishing does not demand a field a driver storage lacks hides", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("layout-box", {
      id: "layout-box",
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        {
          key: "layout",
          label: "Layout",
          type: "string",
          inputType: "text",
          default: "standard",
        },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      meta: {},
    });

    const published = await h.client.entry.update({
      id: draft.id,
      status: "published",
      ifMatch: await currentEtag(h.db, draft.id),
    });

    expect(published.status).toBe("published");
  });

  // Conditions see what storage will hold, not what the caller typed: a number
  // input posts "10", the row stores 10, and the publish gate reads 10.
  test("meta: a driver sent in a form the pipeline settles is judged as settled", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("count-box", {
      id: "count-box",
      label: "Count",
      entryTypes: ["post"],
      fields: [
        { key: "count", label: "Count", type: "number", inputType: "number" },
        {
          key: "reason",
          label: "Reason",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "count", op: "eq", value: 10 }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { count: 1 },
    });

    await expect(
      h.client.entry.update({
        id: post.id,
        meta: { count: "10" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "reason" },
    });
  });

  // A write to a hidden driver is dropped, so it switches nothing on: its
  // dependents are judged by what the edit stores, not by what it sent.
  test("meta: a hidden driver's dropped write does not hold the edit to its dependents", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("chain-box", {
      id: "chain-box",
      label: "Chain",
      entryTypes: ["post"],
      fields: [
        {
          key: "advanced",
          label: "Advanced",
          type: "boolean",
          inputType: "toggle",
        },
        {
          key: "layout",
          label: "Layout",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "advanced", op: "eq", value: true }]],
        },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { advanced: false, layout: "standard" },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { layout: "video" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta.layout).toBe("standard");
  });

  // The same rule inside the patch: a dropped write cannot hide another key in
  // it either, or a visible field's write would vanish without an error.
  test("meta: a hidden driver's dropped write does not hide another key in the same edit", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("chain-box", {
      id: "chain-box",
      label: "Chain",
      entryTypes: ["post"],
      fields: [
        {
          key: "advanced",
          label: "Advanced",
          type: "boolean",
          inputType: "toggle",
        },
        {
          key: "mode",
          label: "Mode",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "advanced", op: "eq", value: true }]],
        },
        {
          key: "note",
          label: "Note",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "mode", op: "eq", value: "on" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { advanced: false, mode: "on" },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { mode: "off", note: "hi" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta.mode).toBe("on");
    expect(updated.meta.note).toBe("hi");
  });

  // Conditions can form a cycle where no set of dropped writes agrees with the
  // result, so nothing is dropped; every write is validated and stored.
  test("meta: an either/or pair written together is stored, not dropped", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("either-box", {
      id: "either-box",
      label: "Either",
      entryTypes: ["post"],
      fields: [
        {
          key: "email",
          label: "Email",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "phone", op: "empty" }]],
        },
        {
          key: "phone",
          label: "Phone",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "email", op: "empty" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: {},
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { email: "a@example.com", phone: "555" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta.email).toBe("a@example.com");
    expect(updated.meta.phone).toBe("555");
  });

  // A driver whose `.sanitize()` yields nothing is not written, so its stored
  // value is what decides the fields it drives — including one this edit
  // clears.
  test("meta: a driver the pipeline leaves unwritten is judged by its stored value", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("layout-box", {
      id: "layout-box",
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        {
          key: "layout",
          label: "Layout",
          type: "string",
          inputType: "text",
          sanitize: () => undefined as never,
        },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "video", video_url: "https://example.com/v" },
    });

    await expect(
      h.client.entry.update({
        id: post.id,
        meta: { layout: "standard", video_url: "" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // A caller cannot fix a field they are not allowed to write, so switching
  // one visible must not hand them an error about it.
  test("meta: an edit is not held to a field its author cannot write", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("layout-box", {
      id: "layout-box",
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        { key: "layout", label: "Layout", type: "string", inputType: "text" },
        {
          key: "video_url",
          label: "Video",
          type: "string",
          inputType: "text",
          required: true,
          capability: "video:manage",
          visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.entry.create({
      authorId: h.user.id,
      status: "published",
      meta: { layout: "standard" },
    });

    const updated = await h.client.entry.update({
      id: post.id,
      meta: { layout: "video" },
      ifMatch: await currentEtag(h.db, post.id),
    });

    expect(updated.meta.layout).toBe("video");
  });

  test("meta: a draft edit that switches a required field visible stays lenient", async () => {
    const plugins = createPluginRegistry();
    registerVideoLayout(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      meta: { layout: "standard" },
    });

    const updated = await h.client.entry.update({
      id: draft.id,
      meta: { layout: "video" },
      ifMatch: await currentEtag(h.db, draft.id),
    });

    expect(updated.meta.layout).toBe("video");
  });

  test("meta: bad key → CONFLICT, and the post row is untouched (validated pre-write)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const post = await h.client.entry.create({ title: "p3", slug: "p3" });
    await expect(
      h.client.entry.update({
        id: post.id,
        title: "new-title",
        meta: { bogus: "x" },
        ifMatch: await currentEtag(h.db, post.id),
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
      ifMatch: await currentEtag(h.db, post.id),
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

  describe("concurrency token (ifMatch)", () => {
    test("a save from the current copy lands and answers with the next etag", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-match",
        updatedAt: new Date("2100-01-01T00:00:00Z"),
      });
      const loaded = await h.client.entry.get({ id: own.id });

      const updated = await h.client.entry.update({
        id: own.id,
        title: "renamed",
        ifMatch: loaded.etag,
      });

      expect(updated).toMatchObject({
        title: "renamed",
        etag: "4102444801",
      });
    });

    test("a save from a stale copy is refused with the entry's current etag", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-stale",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      });

      await expect(
        h.client.entry.update({
          id: own.id,
          title: "lost-race",
          ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: {
          reason: "etag_mismatch",
          etag: "1792324805",
          updatedAt: new Date("2026-10-18T12:00:05Z"),
        },
      });
    });

    test("a save without ifMatch is refused with where to find the etag", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-missing",
      });

      await expect(
        // @ts-expect-error -- the caller left out its copy's token
        h.client.entry.update({ id: own.id, title: "no-token" }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        data: {
          issues: [
            {
              message: "Send the entry's `etag` from `entry.get` as `ifMatch`",
            },
          ],
        },
      });
    });

    test("a stale copy with an empty patch is still refused", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-empty",
      });

      await expect(
        h.client.entry.update({
          id: own.id,
          ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "etag_mismatch" },
      });
    });

    test("an unauthorised caller with a stale copy still gets FORBIDDEN (no CONFLICT oracle)", async () => {
      const h = await createRpcHarness({ authAs: "subscriber" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-no-oracle",
      });

      await expect(
        h.client.entry.update({
          id: own.id,
          title: "x",
          ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { capability: "entry:post:edit_any" },
      });
    });

    test("a write that lands mid-save, after the save read the entry, makes the save conflict", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-mid-save",
      });
      // A plugin's own write, landing after the save read the entry.
      // @ts-expect-error -- `applyFilter` awaits a handler's promise; the
      // registry types `entry:before_save` handlers as sync.
      h.hooks.addFilter("entry:before_save", async (entry) => {
        await h.db
          .update(entries)
          .set({ title: "theirs" })
          .where(eq(entries.id, own.id));
        return entry;
      });

      await expect(
        h.client.entry.update({
          id: own.id,
          title: "mine",
          ifMatch: etagOf(own.updatedAt),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "etag_mismatch" },
      });
      expect(await h.client.entry.get({ id: own.id })).toMatchObject({
        title: "theirs",
      });
    });

    test("two saves in the same second leave different etags, and the first one's is refused", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-same-second",
        updatedAt: new Date("2100-01-01T00:00:00Z"),
      });
      const first = await h.client.entry.update({
        id: own.id,
        title: "first",
        ifMatch: etagOf(own.updatedAt),
      });
      const second = await h.client.entry.update({
        id: own.id,
        title: "second",
        ifMatch: first.etag,
      });

      await expect(
        h.client.entry.update({
          id: own.id,
          title: "from the first copy",
          ifMatch: first.etag,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "etag_mismatch", etag: second.etag },
      });
      expect([first.etag, second.etag]).toEqual(["4102444801", "4102444802"]);
    });

    test("saves chained under a frozen clock each get a later etag", async () => {
      vi.useFakeTimers({
        toFake: ["Date"],
        now: new Date("2026-10-18T12:00:00Z"),
      });
      try {
        const h = await createRpcHarness({ authAs: "author" });
        const own = await h.factory.draft.create({
          authorId: h.user.id,
          slug: "oc-frozen",
          updatedAt: new Date("2026-10-18T12:00:00Z"),
        });
        const etags: string[] = [];
        let ifMatch = etagOf(own.updatedAt);
        for (let save = 1; save <= 20; save += 1) {
          ({ etag: ifMatch } = await h.client.entry.update({
            id: own.id,
            sortOrder: save,
            ifMatch,
          }));
          etags.push(ifMatch);
        }

        expect(etags[19]).toBe("1792324820");
        expect(new Set(etags).size).toBe(20);
      } finally {
        vi.useRealTimers();
      }
    });

    test("a system write moves the token, so a copy taken before it conflicts", async () => {
      const h = await createRpcHarness({ authAs: "editor" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-system-write",
        updatedAt: new Date("2100-01-01T00:00:00Z"),
      });
      await h.client.entry.trash({ id: own.id });

      await expect(
        h.client.entry.update({
          id: own.id,
          title: "from before the trash",
          ifMatch: etagOf(own.updatedAt),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: {
          reason: "etag_mismatch",
          etag: "4102444801",
        },
      });
    });

    test("a refused save leaves the entry's meta, terms and change feed as they were", async () => {
      const plugins = createPluginRegistry();
      registerSeoMetaBox(plugins);
      const h = await createRpcHarness({ authAs: "editor", plugins });
      const category = await h.factory.category.create({ slug: "news" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-refused",
        meta: { meta_title: "kept" },
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      });
      await h.db.delete(entryChanges);

      await expect(
        h.client.entry.update({
          id: own.id,
          meta: { meta_title: "lost" },
          terms: { category: [category.id] },
          ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await h.client.entry.get({ id: own.id })).toMatchObject({
        meta: { meta_title: "kept" },
        terms: {},
      });
      expect(await h.db.select().from(entryChanges)).toEqual([]);
    });

    test("an entry deleted mid-save is reported as a failed update, not a conflict", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-deleted",
      });
      h.spyFilter("entry:before_save").override(async (entry) => {
        await h.db.delete(entries).where(eq(entries.id, own.id));
        return entry;
      });

      await expect(
        h.client.entry.update({
          id: own.id,
          title: "mine",
          ifMatch: etagOf(own.updatedAt),
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "update_failed" },
      });
    });

    test("a save that changes only meta runs no entry:before_save filter", async () => {
      const plugins = createPluginRegistry();
      registerSeoMetaBox(plugins);
      const h = await createRpcHarness({ authAs: "editor", plugins });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-meta-only-filter",
      });
      const beforeSave = h.spyFilter("entry:before_save");

      await h.client.entry.update({
        id: own.id,
        meta: { meta_title: "only meta" },
        ifMatch: etagOf(own.updatedAt),
      });

      beforeSave.assertNotCalled();
    });

    test("a save that changes only meta fires no entry:updated", async () => {
      const plugins = createPluginRegistry();
      registerSeoMetaBox(plugins);
      const h = await createRpcHarness({ authAs: "editor", plugins });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-meta-only-hook",
      });
      const onUpdated = h.spyAction("entry:updated");

      await h.client.entry.update({
        id: own.id,
        meta: { meta_title: "only meta" },
        ifMatch: etagOf(own.updatedAt),
      });

      onUpdated.assertNotCalled();
    });

    test("of saves racing from one copy, exactly one lands", async () => {
      const h = await createRpcHarness({ authAs: "author" });
      const own = await h.factory.draft.create({
        authorId: h.user.id,
        slug: "oc-race",
      });
      const ifMatch = etagOf(own.updatedAt);

      const outcomes = await Promise.allSettled(
        ["a", "b", "c", "d", "e", "f", "g", "h"].map((title) =>
          h.client.entry.update({ id: own.id, title, ifMatch }),
        ),
      );

      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(
        outcomes
          .filter((o) => o.status === "rejected")
          .map((o): unknown => o.reason),
      ).toMatchObject(
        Array.from({ length: 7 }, () => ({
          code: "CONFLICT",
          data: { reason: "etag_mismatch" },
        })),
      );
    });
  });

  // The v1 validator would reject this envelope at the root, so a successful
  // round-trip proves the v2 dispatch was taken.
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
      ifMatch: await currentEtag(h.db, own.id),
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
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "view_private_notes" },
    });
  });
});

describe("entry.update — named template choice", () => {
  test("persists the choice to the reserved template meta key", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "tpl",
    });
    const updated = await h.client.entry.update({
      id: own.id,
      template: "landing",
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(updated.meta[NAMED_TEMPLATE_META_KEY]).toBe("landing");
  });

  test("template: null clears a previously stored choice", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "tpl-clear",
    });
    await h.client.entry.update({
      id: own.id,
      template: "landing",
      ifMatch: await currentEtag(h.db, own.id),
    });
    const cleared = await h.client.entry.update({
      id: own.id,
      template: null,
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(cleared.meta[NAMED_TEMPLATE_META_KEY]).toBeUndefined();
  });

  test("omitting template leaves an existing choice untouched", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "tpl-keep",
    });
    await h.client.entry.update({
      id: own.id,
      template: "landing",
      ifMatch: await currentEtag(h.db, own.id),
    });
    const renamed = await h.client.entry.update({
      id: own.id,
      title: "renamed",
      ifMatch: await currentEtag(h.db, own.id),
    });
    expect(renamed.meta[NAMED_TEMPLATE_META_KEY]).toBe("landing");
  });

  test("the reserved key can't be smuggled through the plugin meta bag", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "tpl-smuggle",
    });
    // `__plumix_template` isn't a registered meta box, so the sanitizer
    // still rejects it on the plugin `meta` path — only the dedicated
    // `template` field writes it.
    await expect(
      h.client.entry.update({
        id: own.id,
        meta: { [NAMED_TEMPLATE_META_KEY]: "landing" },
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered" },
    });
  });
});

describe("entry.update — per-entry access choice", () => {
  test("persists a declared choice to the reserved access meta key", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "a", slug: "a" });

    const updated = await h.client.entry.update({
      id: post.id,
      access: "members",
      ifMatch: await currentEtag(h.db, post.id),
    });
    expect(updated.meta[ACCESS_POLICY_META_KEY]).toBe("members");
  });

  test("access: null clears a previously stored choice", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "b", slug: "b" });

    await h.client.entry.update({
      id: post.id,
      access: "members",
      ifMatch: await currentEtag(h.db, post.id),
    });
    const cleared = await h.client.entry.update({
      id: post.id,
      access: null,
      ifMatch: await currentEtag(h.db, post.id),
    });
    expect(cleared.meta[ACCESS_POLICY_META_KEY]).toBeUndefined();
  });

  test("omitting access leaves an existing choice untouched", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "c", slug: "c" });

    await h.client.entry.update({
      id: post.id,
      access: "members",
      ifMatch: await currentEtag(h.db, post.id),
    });
    const renamed = await h.client.entry.update({
      id: post.id,
      title: "renamed",
      ifMatch: await currentEtag(h.db, post.id),
    });
    expect(renamed.meta[ACCESS_POLICY_META_KEY]).toBe("members");
  });

  test("rejects a policy key the entry type does not declare", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "d", slug: "d" });

    await expect(
      h.client.entry.update({
        id: post.id,
        access: "ghost",
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "access_policy_undeclared" },
    });
  });

  test("rejects any choice when the type declares no access space", async () => {
    // No `post` access registered — the selectable space is empty, so even a
    // plausible key is undeclared.
    const h = await createRpcHarness({ authAs: "admin" });
    const post = await h.client.entry.create({ title: "e", slug: "e" });

    await expect(
      h.client.entry.update({
        id: post.id,
        access: "members",
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "access_policy_undeclared" },
    });
  });

  test("the reserved key can't be smuggled through the plugin meta bag", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "f", slug: "f" });

    await expect(
      h.client.entry.update({
        id: post.id,
        meta: { [ACCESS_POLICY_META_KEY]: "members" },
        ifMatch: await currentEtag(h.db, post.id),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered" },
    });
  });
});

describe("entry.update under an edit lease", () => {
  test("another editor's save during a live lease is refused with who holds it", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const entry = await h.factory.draft.create({ authorId: ada.id });
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.entry.update({
        id: entry.id,
        title: "mine",
        ifMatch: etagOf(entry.updatedAt),
      }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      status: 423,
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("another editor's save after the lease lapsed lands", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const entry = await h.factory.draft.create({ authorId: ada.id });
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
      new Date(Date.now() - 121_000),
    );

    const saved = await h.client.entry.update({
      id: entry.id,
      title: "mine",
      ifMatch: etagOf(entry.updatedAt),
    });

    expect(saved.title).toBe("mine");
  });

  test("a save that passes takeOver lands and takes the lease over", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const entry = await h.factory.draft.create({ authorId: ada.id });
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
    );

    const saved = await h.client.entry.update({
      id: entry.id,
      title: "mine",
      ifMatch: etagOf(entry.updatedAt),
      takeOver: true,
    });

    expect(saved.title).toBe("mine");
    expect(
      await readEditLease(h.db, { kind: "entry", id: entry.id }),
    ).toMatchObject({ holder: { id: h.user.id } });
  });

  test("a stale save names who holds the lease in its conflict", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    const entry = await h.factory.draft.create({ authorId: ada.id });
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
    );

    await expect(
      asAda.client.entry.update({
        id: entry.id,
        title: "from a stale tab",
        ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: ada.id, name: "Ada" } },
    });
  });
});

describe("entry.update — blocks the entry already holds", () => {
  // No plugin registers `acme/hero`, as after the plugin is uninstalled.
  const orphan = { id: "hero1", name: "acme/hero", attrs: { title: "Hi" } };
  const text = (id: string, body = "<p>Hello</p>") => ({
    id,
    name: "core/rich-text",
    attrs: { body },
  });
  const v2 = (blocks: readonly unknown[]) => ({
    version: "plumix.v2" as const,
    blocks,
  });

  async function holdingOrphan() {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "holds-orphan",
      content: v2([orphan, text("p1")]),
    });
    return { h, own };
  }

  test("saves an entry holding an unregistered block and keeps the node unchanged", async () => {
    const { h, own } = await holdingOrphan();
    const content = v2([orphan, text("p1", "<p>Edited</p>")]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });

  async function refusal(content: unknown) {
    const { h, own } = await holdingOrphan();
    const error: unknown = await h.client.entry
      .update({
        id: own.id,
        content: content as never,
        ifMatch: await currentEtag(h.db, own.id),
      })
      .catch((rejection: unknown) => rejection);
    return error;
  }

  test("refuses a new node of an unregistered block", async () => {
    const error = await refusal(
      v2([orphan, { id: "hero2", name: "acme/hero", attrs: {} }]),
    );

    expect(error).toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "unknown_block_type",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("refuses a stored id used twice", async () => {
    const error = await refusal(v2([orphan, orphan]));

    expect(error).toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "unknown_block_type",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("refuses a stored id under another block name", async () => {
    const error = await refusal(v2([{ ...orphan, name: "acme/other" }]));

    expect(error).toMatchObject({ code: "INVALID_BLOCK_CONTENT" });
  });

  test("keeps a stored node moved into another parent among new siblings", async () => {
    const { h, own } = await holdingOrphan();
    const content = v2([
      text("p0"),
      {
        id: "g1",
        name: "core/group",
        attrs: { content: [text("p2"), orphan, text("p3")] },
      },
    ]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });

  test("keeps a node only the caller's autosave holds", async () => {
    const plugins = createPluginRegistry();
    plugins.entryTypes.set(
      "post",
      toRegisteredEntryType(
        "post",
        { label: "Posts", supports: ["autosave"] },
        null,
      ),
    );
    const h = await createRpcHarness({ authAs: "author", plugins });
    const own = await h.factory.published.create({
      authorId: h.user.id,
      slug: "autosave-orphan",
      content: v2([text("p1")]),
    });
    await upsertAutosave(h.db, {
      entry: own,
      authorId: h.user.id,
      patch: {
        title: own.title,
        content: v2([orphan, text("p1")]),
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });
    const content = v2([text("p1"), orphan]);

    const draft = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(draft.content).toEqual(content);
  });
});

describe("entry.update — the blocks the theme allows", () => {
  // `core/rich-text` is registered but outside the theme's list.
  const theme = { ...defaultTestTheme, allowedBlocks: ["core/group"] };
  const text = (id: string, body = "<p>Hello</p>") => ({
    id,
    name: "core/rich-text",
    attrs: { body },
  });
  const v2 = (blocks: readonly unknown[]) => ({
    version: "plumix.v2" as const,
    blocks,
  });

  async function holdingText() {
    const h = await createRpcHarness({ authAs: "author", config: { theme } });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "holds-text",
      content: v2([text("p1")]),
    });
    return { h, own };
  }

  test("refuses a new node of a block outside the set", async () => {
    const { h, own } = await holdingText();

    await expect(
      h.client.entry.update({
        id: own.id,
        content: v2([text("p1"), text("p2")]),
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "block_not_allowed",
            path: "blocks[1]",
            nodeName: "core/rich-text",
          }),
        ],
      },
    });
  });

  test("keeps a stored node of a block outside the set, moved and edited", async () => {
    const { h, own } = await holdingText();
    const content = v2([
      {
        id: "g1",
        name: "core/group",
        attrs: { content: [text("p1", "<p>Edited</p>")] },
      },
    ]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });
});

describe("entry.update — the theme's style policy", () => {
  const theme = {
    ...defaultTestTheme,
    allowCustomStyles: false,
    tokens: { color: { primary: { value: "#06f" } } },
  };
  const text = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: "core/rich-text",
    attrs: { body: "<p>Hello</p>" },
    ...extra,
  });
  const v2 = (blocks: readonly unknown[]) => ({
    version: "plumix.v2" as const,
    blocks,
  });

  async function holdingLiteral() {
    const h = await createRpcHarness({ authAs: "author", config: { theme } });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "holds-literal",
      content: v2([text("p1", { style: { large: { color: "#e11" } } })]),
    });
    return { h, own };
  }

  test.each([
    [
      "a new literal",
      text("p2", { style: { large: { color: "#f00" } } }),
      "color",
    ],
    [
      "an undeclared token",
      text("p2", {
        style: { large: { color: "var(--plumix-color-gone, #f00)" } },
      }),
      "color",
    ],
    [
      "a new Custom CSS declaration",
      text("p2", { style: { large: { transform: "rotate(3deg)" } } }),
      "transform",
    ],
    ["a new class name", text("p2", { className: "brand-red" }), "className"],
  ])("refuses %s", async (_, added, property) => {
    const { h, own } = await holdingLiteral();

    await expect(
      h.client.entry.update({
        id: own.id,
        content: v2([
          text("p1", { style: { large: { color: "#e11" } } }),
          added,
        ]),
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "style_not_allowed",
            path: "blocks[1]",
            property,
          }),
        ],
      },
    });
  });

  test("refuses a stored forbidden literal changed to another", async () => {
    const { h, own } = await holdingLiteral();

    await expect(
      h.client.entry.update({
        id: own.id,
        content: v2([text("p1", { style: { large: { color: "#f00" } } })]),
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "style_not_allowed",
            path: "blocks[0]",
          }),
        ],
      },
    });
  });

  test("keeps a stored literal moved with its block", async () => {
    const { h, own } = await holdingLiteral();
    const content = v2([
      {
        id: "g1",
        name: "core/group",
        attrs: {
          content: [text("p1", { style: { large: { color: "#e11" } } })],
        },
      },
    ]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });

  test("saves a cleared literal", async () => {
    const { h, own } = await holdingLiteral();
    const content = v2([text("p1")]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });

  test("saves a block's defaultStyles values", async () => {
    const { h, own } = await holdingLiteral();
    const content = v2([
      {
        id: "s1",
        name: "core/section",
        attrs: { content: [] },
        style: { large: { paddingTop: "3rem", paddingBottom: "3rem" } },
      },
    ]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });
});

describe("entry.update — a writer without edit_layout", () => {
  const text = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: "core/rich-text",
    attrs: { body: "<p>Hello</p>" },
    ...extra,
  });
  const group = (id: string, children: readonly unknown[]) => ({
    id,
    name: "core/group",
    attrs: { content: children },
  });
  const button = (id: string, attrs: Record<string, unknown> = {}) => ({
    id,
    name: "core/button",
    attrs: { label: "Buy", href: "/buy", ...attrs },
  });
  const v2 = (blocks: readonly unknown[]) => ({
    version: "plumix.v2" as const,
    blocks,
  });
  const stored = () =>
    v2([text("p1"), group("g1", [text("p2")]), button("b1")]);

  // A contributor edits their own posts but holds no `entry:post:edit_layout`.
  async function contentOnlyWriter(
    authAs: "contributor" | "author" = "contributor",
  ) {
    const h = await createRpcHarness({ authAs });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "content-only",
      content: stored(),
    });
    return { h, own };
  }

  const layoutChanges: readonly [string, ReturnType<typeof v2>, string][] = [
    [
      "an inserted node",
      v2([text("p1"), group("g1", [text("p2")]), button("b1"), text("p3")]),
      "blocks[3]",
    ],
    [
      "a removed node",
      v2([text("p1"), group("g1", []), button("b1")]),
      "blocks[1].content[0]",
    ],
    [
      "a moved node",
      v2([group("g1", [text("p2"), text("p1")]), button("b1")]),
      "blocks[0].content[1]",
    ],
    [
      "a reordered sibling",
      v2([group("g1", [text("p2")]), text("p1"), button("b1")]),
      "blocks[1]",
    ],
    [
      "a changed style",
      v2([
        text("p1", { style: { large: { color: "#e11" } } }),
        group("g1", [text("p2")]),
        button("b1"),
      ]),
      "blocks[0]",
    ],
    [
      "a changed hidden flag",
      v2([
        text("p1", { hidden: { small: true } }),
        group("g1", [text("p2")]),
        button("b1"),
      ]),
      "blocks[0]",
    ],
    [
      "changed HTML attributes",
      v2([
        text("p1"),
        group("g1", [text("p2", { htmlAttrs: { id: "x" } })]),
        button("b1"),
      ]),
      "blocks[1].content[0]",
    ],
    [
      "a changed class name",
      v2([
        text("p1", { className: "lead" }),
        group("g1", [text("p2")]),
        button("b1"),
      ]),
      "blocks[0]",
    ],
    [
      "a changed tag name",
      v2([
        text("p1"),
        { ...group("g1", [text("p2")]), tagName: "aside" },
        button("b1"),
      ]),
      "blocks[1]",
    ],
    [
      "a changed settings input",
      v2([
        text("p1"),
        group("g1", [text("p2")]),
        button("b1", { openInNewTab: true }),
      ]),
      "blocks[2]",
    ],
    [
      "a renamed node",
      v2([
        { id: "p1", name: "core/code", attrs: { text: "Hello" } },
        group("g1", [text("p2")]),
        button("b1"),
      ]),
      "blocks[0]",
    ],
    [
      "a node copied under its own id",
      v2([text("p1"), text("p1"), group("g1", [text("p2")]), button("b1")]),
      "blocks[1]",
    ],
  ];

  test.each(layoutChanges)("refuses %s", async (_, content, path) => {
    const { h, own } = await contentOnlyWriter();

    await expect(
      h.client.entry.update({
        id: own.id,
        content,
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        // A reorder moves two siblings, so the change can name more than one.
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "layout_change", path }),
        ]) as unknown,
      },
    });
  });

  test.each([
    [
      "a changed content input",
      v2([
        text("p1", { attrs: { body: "<p>Fixed</p>" } }),
        group("g1", [text("p2")]),
        button("b1", { label: "Order", href: "/order" }),
      ]),
    ],
    [
      "a changed label",
      v2([
        text("p1", { label: "Intro" }),
        group("g1", [text("p2")]),
        button("b1"),
      ]),
    ],
  ])("accepts %s", async (_, content) => {
    const { h, own } = await contentOnlyWriter();

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });

  test.each(layoutChanges)(
    "a writer with edit_layout saves %s",
    async (_, content) => {
      const { h, own } = await contentOnlyWriter("author");

      const updated = await h.client.entry.update({
        id: own.id,
        content,
        ifMatch: await currentEtag(h.db, own.id),
      });

      expect(updated.content).toEqual(content);
    },
  );
});

describe("entry.update — a block's capability", () => {
  // Inserting `test/script` takes `settings:manage`, an admin's.
  function scriptRegistry() {
    const plugins = createPluginRegistry();
    plugins.blockSpecs.set("test/script", {
      spec: {
        name: "test/script",
        render: () => null,
        capability: "settings:manage",
      },
      registeredBy: "test",
    });
    return plugins;
  }
  const script = (id: string) => ({ id, name: "test/script", attrs: {} });
  const v2 = (blocks: readonly unknown[]) => ({
    version: "plumix.v2" as const,
    blocks,
  });

  async function holdingScript() {
    const h = await createRpcHarness({
      authAs: "author",
      plugins: scriptRegistry(),
    });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      content: v2([script("s1")]),
    });
    return { h, own };
  }

  test("refuses a new node of a block whose capability the writer lacks", async () => {
    const { h, own } = await holdingScript();

    await expect(
      h.client.entry.update({
        id: own.id,
        content: v2([script("s1"), script("s2")]),
        ifMatch: await currentEtag(h.db, own.id),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "block_not_allowed",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("keeps a stored node of that block", async () => {
    const { h, own } = await holdingScript();
    const content = v2([script("s1")]);

    const updated = await h.client.entry.update({
      id: own.id,
      content,
      ifMatch: await currentEtag(h.db, own.id),
    });

    expect(updated.content).toEqual(content);
  });
});
