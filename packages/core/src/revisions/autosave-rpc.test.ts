import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import { createRpcHarness } from "../test/rpc.js";

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

async function publishedPostFixture(): Promise<
  Awaited<ReturnType<typeof createRpcHarness>> & { entryId: number }
> {
  const h = await createRpcHarness({
    authAs: "editor",
    plugins: registryWithAutosave(),
  });
  const created = await h.client.entry.create({
    title: "Live",
    slug: "live",
    status: "published",
  });
  return Object.assign(h, { entryId: created.id });
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
});
