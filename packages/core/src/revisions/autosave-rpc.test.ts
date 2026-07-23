import { describe, expect, test } from "vitest";

import type { Entry } from "../db/schema/entries.js";
import type { MetaBoxField } from "../plugin/manifest.js";
import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { NAMED_TEMPLATE_META_KEY } from "../route/render/template-builders.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { createRpcHarness } from "../test/rpc.js";
import { getAutosave, upsertAutosave } from "./repository.js";

function registryWithAutosave() {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    name: "post",
    label: "Posts",
    supports: ["revisions", "autosave"],
    versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
    registeredBy: "test",
  });
  return plugins;
}

function registryWithoutAutosave() {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    name: "post",
    label: "Posts",
    supports: ["revisions"],
    versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
    registeredBy: "test",
  });
  return plugins;
}

function registryWithMetaField(field: MetaBoxField) {
  const plugins = registryWithAutosave();
  plugins.entryMetaBoxes.set("test-box", {
    id: "test-box",
    label: "Test box",
    entryTypes: ["post"],
    fields: [field],
    registeredBy: "test",
  });
  return plugins;
}

async function publishedPostFixture(plugins = registryWithAutosave()): Promise<
  Awaited<ReturnType<typeof createRpcHarness>> & {
    entryId: number;
    liveUpdatedAt: Date;
  }
> {
  const h = await createRpcHarness({ authAs: "editor", plugins });
  const created = await h.client.entry.create({
    title: "Live",
    slug: "live",
    status: "published",
  });
  return Object.assign(h, {
    entryId: created.id,
    liveUpdatedAt: created.updatedAt,
  });
}

describe("entry.update saveAs", () => {
  test("default routing on a published+autosave-supporting type writes to autosave, not live", async () => {
    const h = await publishedPostFixture();
    const result = await h.client.entry.update({
      id: h.entryId,
      title: "Draft title",
    });
    // The returned row is the autosave (different id from live; type
    // `autosave`). Client can't see this directly because the type
    // declaration is `Entry` and `type` is a string — but the test
    // can read the persisted shape.
    expect(result.type).toBe("autosave");
    expect(result.title).toBe("Draft title");
    // Live is unchanged.
    const live = await h.client.entry.get({ id: h.entryId });
    expect(live.title).toBe("Live");
  });

  test("carries a named-template choice into the autosave row's meta (preview honors an unsaved pick)", async () => {
    const h = await publishedPostFixture();
    const result = await h.client.entry.update({
      id: h.entryId,
      template: "landing",
    });
    expect(result.type).toBe("autosave");
    expect(result.meta[NAMED_TEMPLATE_META_KEY]).toBe("landing");
    // Live row is untouched until the draft is published.
    const live = await h.client.entry.get({ id: h.entryId });
    expect(live.meta[NAMED_TEMPLATE_META_KEY]).toBeUndefined();
  });

  test("explicit saveAs: 'live' bypasses the default and writes to live even when supports has 'autosave'", async () => {
    const h = await publishedPostFixture();
    const result = await h.client.entry.update({
      id: h.entryId,
      title: "Edited live",
      saveAs: "live",
    });
    expect(result.type).toBe("post");
    expect(result.title).toBe("Edited live");
  });

  test("saveAs: 'draft' on a type without 'autosave' supports → BAD_REQUEST", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithoutAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    await expect(
      h.client.entry.update({
        id: created.id,
        title: "Draft",
        saveAs: "draft",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "autosave_unsupported" },
    });
  });

  test("saveAs: 'draft' on a non-published entry → BAD_REQUEST", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "D",
      slug: "d",
      // default status is draft — not published, so a draft autosave
      // makes no sense (the row IS the draft).
    });
    await expect(
      h.client.entry.update({
        id: created.id,
        title: "Pending",
        saveAs: "draft",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "autosave_requires_published" },
    });
  });

  test("autosave write runs field sanitizers so publish promotes the sanitized value", async () => {
    const h = await publishedPostFixture(
      registryWithMetaField({
        key: "accent_color",
        label: "Accent color",
        type: "string",
        inputType: "text",
        sanitize: (value) => String(value).toLowerCase(),
      }),
    );
    const autosave = await h.client.entry.update({
      id: h.entryId,
      meta: { accent_color: "#FFA500" },
    });
    expect(autosave.type).toBe("autosave");
    expect(autosave.meta.accent_color).toBe("#ffa500");
    const promoted = await h.client.entry.publish({
      id: h.entryId,
      expectedLiveUpdatedAt: h.liveUpdatedAt,
    });
    expect(promoted.meta.accent_color).toBe("#ffa500");
  });

  test("null meta value on autosave deletes the key from the promoted live row (not a literal null)", async () => {
    const h = await publishedPostFixture(
      registryWithMetaField({
        key: "accent_color",
        label: "Accent color",
        type: "string",
        inputType: "text",
      }),
    );
    await h.client.entry.update({
      id: h.entryId,
      meta: { accent_color: "#abc" },
      saveAs: "live",
    });
    const live = await h.client.entry.get({ id: h.entryId });
    expect(live.meta.accent_color).toBe("#abc");
    const autosave = await h.client.entry.update({
      id: h.entryId,
      meta: { accent_color: null },
    });
    expect(autosave.type).toBe("autosave");
    expect("accent_color" in autosave.meta).toBe(false);
    const promoted = await h.client.entry.publish({
      id: h.entryId,
      expectedLiveUpdatedAt: live.updatedAt,
    });
    expect("accent_color" in promoted.meta).toBe(false);
  });

  test("autosave write rejects a capability-gated meta field with FORBIDDEN", async () => {
    const h = await publishedPostFixture(
      registryWithMetaField({
        key: "private_note",
        label: "Private note",
        type: "string",
        inputType: "text",
        capability: "view_private_notes",
      }),
    );
    await expect(
      h.client.entry.update({
        id: h.entryId,
        meta: { private_note: "leaked" },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "view_private_notes" },
    });
  });

  test("autosave write rejects a dangling reference id with CONFLICT", async () => {
    const plugins = registryWithMetaField({
      key: "owner",
      label: "Owner",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    });
    registerCoreLookupAdapters(plugins);
    const h = await publishedPostFixture(plugins);
    await expect(
      h.client.entry.update({
        id: h.entryId,
        meta: { owner: "999999" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "owner" },
    });
  });

  test("autosave write fires entry:<type>:autosave_saved but NOT entry:updated", async () => {
    const h = await publishedPostFixture();
    const autosaveFires: number[] = [];
    const updatedFires: number[] = [];
    h.hooks.addAction("entry:post:autosave_saved", (autosave) => {
      autosaveFires.push(autosave.id);
    });
    h.hooks.addAction("entry:post:updated", (entry) => {
      updatedFires.push(entry.id);
    });
    await h.client.entry.update({
      id: h.entryId,
      title: "Pending",
    });
    expect(autosaveFires).toHaveLength(1);
    expect(updatedFires).toHaveLength(0);
  });
});

describe("entry.get preview", () => {
  test("preview=true with an existing autosave overlays the pending fields and tags _preview source=autosave", async () => {
    const h = await publishedPostFixture();
    await h.client.entry.update({ id: h.entryId, title: "Pending title" });
    const previewed = await h.client.entry.get({
      id: h.entryId,
      preview: true,
    });
    expect(previewed.title).toBe("Pending title");
    expect(previewed._preview?.source).toBe("autosave");
    expect(previewed._preview?.autosaveUpdatedAt).not.toBeNull();
  });

  test("preview=true with no autosave returns the live row tagged _preview source=live", async () => {
    const h = await publishedPostFixture();
    const previewed = await h.client.entry.get({
      id: h.entryId,
      preview: true,
    });
    expect(previewed.title).toBe("Live");
    expect(previewed._preview?.source).toBe("live");
    expect(previewed._preview?.autosaveUpdatedAt).toBeNull();
  });

  test("preview=false (default) returns the live row WITHOUT _preview metadata even when an autosave exists", async () => {
    const h = await publishedPostFixture();
    await h.client.entry.update({ id: h.entryId, title: "Pending" });
    const live = await h.client.entry.get({ id: h.entryId });
    expect(live.title).toBe("Live");
    expect(live._preview).toBeUndefined();
  });

  test("preview=true without edit caps is rejected with FORBIDDEN", async () => {
    // Subscribers can read published entries but not preview them —
    // preview is an editorial concern gated by edit_own / edit_any.
    const h = await publishedPostFixture();
    const subscriber = await h.actingAs("subscriber");
    await expect(
      subscriber.client.entry.get({ id: h.entryId, preview: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("entry.publish", () => {
  test("promotes the autosave fields onto live, deletes the autosave, creates a revision", async () => {
    const h = await publishedPostFixture();
    const beforePublish = await h.client.entry.get({ id: h.entryId });
    await h.client.entry.update({
      id: h.entryId,
      title: "Promoted title",
    });
    const promoted = await h.client.entry.publish({
      id: h.entryId,
      expectedLiveUpdatedAt: beforePublish.updatedAt,
    });
    expect(promoted.title).toBe("Promoted title");
    expect(promoted.type).toBe("post");
    // Autosave is gone — preview now returns live with source=live.
    const previewed = await h.client.entry.get({
      id: h.entryId,
      preview: true,
    });
    expect(previewed._preview?.source).toBe("live");
    // Revision captured because the type supports it.
    const revisions = await h.client.entry.revisions.list({
      entryId: h.entryId,
    });
    expect(revisions.revisions.length).toBeGreaterThanOrEqual(1);
  });

  // The write-time gate (#1533) only canonicalizes autosaves written
  // *after* it deployed. `upsertAutosave` stores the raw bag verbatim,
  // so it stands in for a draft persisted *before* the gate existed —
  // exactly the rows publish must re-sanitize.
  async function stalePendingAutosave(
    h: Awaited<ReturnType<typeof publishedPostFixture>>,
    meta: Record<string, unknown>,
  ): Promise<Entry> {
    const live = await h.db.query.entries.findFirst({
      where: eq(entries.id, h.entryId),
    });
    if (!live) throw new Error("expected a live entry fixture");
    if (!h.user) throw new Error("expected an authenticated user");
    await upsertAutosave(h.db, {
      entry: live,
      authorId: h.user.id,
      patch: {
        title: live.title,
        content: live.content,
        excerpt: live.excerpt,
        meta,
      },
    });
    return live;
  }

  test("re-sanitizes a registered meta key promoted from a pre-#1533 autosave", async () => {
    const h = await publishedPostFixture(
      registryWithMetaField({
        key: "accent_color",
        label: "Accent color",
        type: "string",
        inputType: "text",
        sanitize: (value) => String(value).toLowerCase(),
      }),
    );
    const live = await stalePendingAutosave(h, { accent_color: "#FFA500" });
    const promoted = await h.client.entry.publish({
      id: h.entryId,
      expectedLiveUpdatedAt: live.updatedAt,
    });
    expect(promoted.meta.accent_color).toBe("#ffa500");
  });

  test("passes an unregistered meta key from a stale autosave through untouched", async () => {
    const h = await publishedPostFixture(
      registryWithMetaField({
        key: "accent_color",
        label: "Accent color",
        type: "string",
        inputType: "text",
        sanitize: (value) => String(value).toLowerCase(),
      }),
    );
    // `from_uninstalled_plugin` resolves to no field — `decodeMetaBag`
    // preserves it and re-sanitize must not reject it as
    // `meta_not_registered`, only canonicalize the registered sibling.
    const live = await stalePendingAutosave(h, {
      accent_color: "#FFA500",
      from_uninstalled_plugin: { keep: 1 },
    });
    const promoted = await h.client.entry.publish({
      id: h.entryId,
      expectedLiveUpdatedAt: live.updatedAt,
    });
    expect(promoted.meta.accent_color).toBe("#ffa500");
    expect(promoted.meta.from_uninstalled_plugin).toEqual({ keep: 1 });
  });

  test("promotes a schema-drifted registered value leniently instead of aborting the publish", async () => {
    // The live write path already gates user intent; a value that now
    // fails validation is schema drift or a legacy row. Re-validating the
    // whole promoted bag must not block an unrelated publish over a field
    // the caller never touched — so a failing value is kept, not rejected.
    const h = await publishedPostFixture(
      registryWithMetaField({
        key: "rating",
        label: "Rating",
        type: "number",
        inputType: "number",
        min: 1,
        max: 5,
      }),
    );
    const live = await stalePendingAutosave(h, { rating: 99 });
    const promoted = await h.client.entry.publish({
      id: h.entryId,
      expectedLiveUpdatedAt: live.updatedAt,
    });
    expect(promoted.meta.rating).toBe(99);
  });

  test("returns CONFLICT when expectedLiveUpdatedAt is stale", async () => {
    const h = await publishedPostFixture();
    await h.client.entry.update({ id: h.entryId, title: "Pending" });
    await expect(
      h.client.entry.publish({
        id: h.entryId,
        expectedLiveUpdatedAt: new Date("2020-01-01"),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "stale_expected_updated_at" },
    });
  });

  test("returns BAD_REQUEST { reason: no_pending_draft } when the caller has no autosave", async () => {
    const h = await publishedPostFixture();
    const live = await h.client.entry.get({ id: h.entryId });
    await expect(
      h.client.entry.publish({
        id: h.entryId,
        expectedLiveUpdatedAt: live.updatedAt,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "no_pending_draft" },
    });
  });
});

describe("entry.discardDraft", () => {
  test("deletes the caller's autosave and returns discarded=true", async () => {
    const h = await publishedPostFixture();
    await h.client.entry.update({ id: h.entryId, title: "Pending" });
    const result = await h.client.entry.discardDraft({ id: h.entryId });
    expect(result.discarded).toBe(true);
    const previewed = await h.client.entry.get({
      id: h.entryId,
      preview: true,
    });
    expect(previewed._preview?.source).toBe("live");
  });

  test("returns discarded=false (no error) when there's nothing to clean up", async () => {
    const h = await publishedPostFixture();
    const result = await h.client.entry.discardDraft({ id: h.entryId });
    expect(result.discarded).toBe(false);
  });

  test("fires entry:<type>:autosave_discarded when a row was actually deleted", async () => {
    const h = await publishedPostFixture();
    const discards: number[] = [];
    h.hooks.addAction("entry:post:autosave_discarded", (live, authorId) => {
      discards.push(authorId);
    });
    await h.client.entry.update({ id: h.entryId, title: "Pending" });
    await h.client.entry.discardDraft({ id: h.entryId });
    expect(discards).toHaveLength(1);
    // Second call — nothing to discard, no hook fire.
    await h.client.entry.discardDraft({ id: h.entryId });
    expect(discards).toHaveLength(1);
  });

  test("autosave meta persists plain ids for hydrated reference values", async () => {
    // Reads hydrate reference meta to `{ id, ... }` payloads; an
    // untouched field rides back through the autosave write in that
    // shape. Storage must stay plain ids — never hydrated snapshots.
    const plugins = registryWithAutosave();
    registerCoreLookupAdapters(plugins);
    plugins.entryMetaBoxes.set("relations", {
      id: "relations",
      label: "Relations",
      entryTypes: ["post"],
      fields: [
        {
          key: "owner",
          label: "Owner",
          inputType: "user",
          type: "string",
          referenceTarget: { kind: "user" },
        },
      ],
      registeredBy: null,
    });
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const created = await h.client.entry.create({
      title: "Live",
      slug: "live-ref",
      status: "published",
    });
    const target = await h.factory.user.create({ name: "Owner One" });

    await h.client.entry.update({
      id: created.id,
      title: "Draft",
      meta: {
        owner: {
          id: String(target.id),
          name: "Owner One",
          slug: target.slug,
          avatarUrl: null,
        },
      },
    });

    const autosave = await getAutosave(h.context.db, {
      entryId: created.id,
      authorId: h.user.id,
    });
    expect((autosave?.meta as Record<string, unknown> | null)?.owner).toBe(
      String(target.id),
    );
  });
});
