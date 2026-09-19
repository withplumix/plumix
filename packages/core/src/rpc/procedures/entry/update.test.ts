import { describe, expect, test } from "vitest";

import { ACCESS_POLICY_META_KEY } from "../../../access/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
} from "../../../access/policy.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { toRegisteredEntryType } from "../../../plugin/registry.js";
import { NAMED_TEMPLATE_META_KEY } from "../../../route/render/template-builders.js";
import { pooledEntryTypeRegistry } from "../../../test/pooled-entry-types.js";
import { createRpcHarness } from "../../../test/rpc.js";

// Register a `post` entry type carrying a selectable per-entry access space, so
// the update handler validates a caller's `access` key against it.
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

// `video_url` is required only while `layout` is "video" — the smallest shape
// in which one key's value decides whether another key is required.
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
    });
    expect(updated.title).toBe("renamed");
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

    const updated = await h.client.entry.update({ id: own.id, title: "mine" });
    expect(updated.title).toBe("mine");
    await expect(
      h.client.entry.update({ id: theirs.id, title: "hax" }),
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
    const updated = await h.client.entry.update({ id: own.id, title: "" });
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
    });
    expect(updated.meta.subtitle).toBe("");
  });

  test("meta: publishing a draft enforces a required field it left empty", async () => {
    const plugins = createPluginRegistry();
    registerRequiredSubtitle(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const draft = await h.factory.draft.create({ authorId: h.user.id });
    await h.client.entry.update({ id: draft.id, meta: { subtitle: "" } });
    // The publish transition strict-validates the full stored bag, so the
    // required field the draft left empty blocks the transition even though
    // this patch carries no meta.
    await expect(
      h.client.entry.update({ id: draft.id, status: "published" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value" },
    });
  });

  // A strict edit validates its own keys so that a co-author's older drift
  // cannot block it. That reasoning covers drift that already exists, not drift
  // the edit creates: switching a driver on makes its dependent required, and
  // leaving the dependent unset is this edit's doing.
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
      h.client.entry.update({ id: post.id, meta: { layout: "video" } }),
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
      h.client.entry.update({ id: scheduled.id, meta: { layout: "video" } }),
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
    });

    expect(updated.meta.video_url).toBe("https://example.com/v");
  });

  // Visibility is judged against the row as it will be, so a field the stored
  // driver hides is not held to a rule it is not subject to. A hidden field is
  // dropped from the write rather than validated, so its stored value stays —
  // the same thing the publish gate does with one.
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
      h.client.entry.update({ id: post.id, meta: { video_url: "" } }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // The reason the patch-only rule exists: drift the edit did not cause and
  // does not change the conditions of must not block it — including an edit
  // that re-sends a driver at the value it already holds.
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
    });

    expect(updated.title).toBe("fixed a typo");
  });

  // A default applies on read and is never stored, so a driver resting on its
  // default is absent from the row. Judged without it, the field it shows
  // would read as hidden and the write to it would be dropped unannounced.
  test("meta: a field shown by its driver's default is written", async () => {
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
    });

    expect(updated.meta.video_url).toBe("https://example.com/v");
  });

  // A default shows on read but is never stored, and the publish gate judges
  // storage — so a required field resting on its default is still missing.
  // Switching it visible has to be held to the same rule the gate will apply.
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
      h.client.entry.update({ id: post.id, meta: { layout: "video" } }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // A driver never stored reads as its default, so sending it at that default
  // shows nothing that was not already shown — the admin sends full form state,
  // which does exactly this on the first save after a field is added.
  test("meta: sending a driver at the default it already reads as is not a change", async () => {
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

    const updated = await h.client.entry.update({
      id: post.id,
      title: "fixed a typo",
      meta: { layout: "video" },
    });

    expect(updated.title).toBe("fixed a typo");
  });

  // The publish gate has to see a field the way the editor does. The admin
  // hides `video_url` here — `layout` reads as its default — so a gate that
  // treated the absent driver as "shown" would demand a field the author can
  // neither see nor, since a write to a hidden field is dropped, supply.
  test("meta: publishing does not demand a field its driver's default hides", async () => {
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
      h.client.entry.update({ id: post.id, meta: { count: "10" } }),
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
    });

    expect(updated.meta.mode).toBe("on");
    expect(updated.meta.note).toBe("hi");
  });

  // Conditions can form a cycle — an either/or pair hides each other — and then
  // no set of dropped writes agrees with the row it leaves. Nothing is dropped:
  // every write is validated and stored rather than lost without an error.
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
    });

    expect(updated.meta.email).toBe("a@example.com");
    expect(updated.meta.phone).toBe("555");
  });

  // A driver whose `.sanitize()` yields nothing is not written, so its stored
  // value is what decides the fields it drives — including one this edit clears.
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
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // Mirrors the publish gate: a caller cannot fix a field they are not allowed
  // to write, so switching one visible must not hand them an error about it.
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
    });
    expect(updated.meta[NAMED_TEMPLATE_META_KEY]).toBe("landing");
  });

  test("template: null clears a previously stored choice", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "tpl-clear",
    });
    await h.client.entry.update({ id: own.id, template: "landing" });
    const cleared = await h.client.entry.update({ id: own.id, template: null });
    expect(cleared.meta[NAMED_TEMPLATE_META_KEY]).toBeUndefined();
  });

  test("omitting template leaves an existing choice untouched", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const own = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "tpl-keep",
    });
    await h.client.entry.update({ id: own.id, template: "landing" });
    const renamed = await h.client.entry.update({
      id: own.id,
      title: "renamed",
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
    });
    expect(updated.meta[ACCESS_POLICY_META_KEY]).toBe("members");
  });

  test("access: null clears a previously stored choice", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "b", slug: "b" });

    await h.client.entry.update({ id: post.id, access: "members" });
    const cleared = await h.client.entry.update({ id: post.id, access: null });
    expect(cleared.meta[ACCESS_POLICY_META_KEY]).toBeUndefined();
  });

  test("omitting access leaves an existing choice untouched", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "c", slug: "c" });

    await h.client.entry.update({ id: post.id, access: "members" });
    const renamed = await h.client.entry.update({
      id: post.id,
      title: "renamed",
    });
    expect(renamed.meta[ACCESS_POLICY_META_KEY]).toBe("members");
  });

  test("rejects a policy key the entry type does not declare", async () => {
    const plugins = createPluginRegistry();
    registerPostAccess(plugins);
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.client.entry.create({ title: "d", slug: "d" });

    await expect(
      h.client.entry.update({ id: post.id, access: "ghost" }),
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
      h.client.entry.update({ id: post.id, access: "members" }),
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
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered" },
    });
  });
});
