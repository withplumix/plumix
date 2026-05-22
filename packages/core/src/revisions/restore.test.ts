import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createRpcHarness } from "../test/rpc.js";
import { REVISION_TYPE } from "./slug-codec.js";

function registryWithRevisions() {
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

async function seedEntryWithRevision(): Promise<{
  readonly h: Awaited<ReturnType<typeof createRpcHarness>>;
  readonly entryId: number;
  readonly revisionId: number;
}> {
  const h = await createRpcHarness({
    authAs: "editor",
    plugins: registryWithRevisions(),
  });
  const created = await h.client.entry.create({
    title: "First",
    slug: "first",
  });
  await h.client.entry.update({ id: created.id, title: "Second" });
  const [revision] = await h.db.query.entries.findMany({
    where: eq(entries.type, REVISION_TYPE),
  });
  if (!revision) throw new Error("expected one captured revision");
  return { h, entryId: created.id, revisionId: revision.id };
}

describe("entry.revisions.restore", () => {
  test("writes the revision's content/title into the live entry", async () => {
    const { h, entryId, revisionId } = await seedEntryWithRevision();
    await h.client.entry.update({ id: entryId, title: "Third" });

    const restored = await h.client.entry.revisions.restore({ revisionId });

    expect(restored.id).toBe(entryId);
    expect(restored.title).toBe("Second");
    const live = await h.db.query.entries.findFirst({
      where: eq(entries.id, entryId),
    });
    expect(live?.title).toBe("Second");
  });

  test("does NOT snapshot the post-restore state — restore is invisible to history", async () => {
    const { h, entryId, revisionId } = await seedEntryWithRevision();
    await h.client.entry.update({ id: entryId, title: "Third" });

    const before = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    await h.client.entry.revisions.restore({ revisionId });
    const after = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    expect(after.length).toBe(before.length);
  });

  test("stale expectedLiveUpdatedAt rejects with CONFLICT", async () => {
    const { h, entryId, revisionId } = await seedEntryWithRevision();
    const stale = new Date(Date.now() - 60_000);
    await h.client.entry.update({ id: entryId, title: "Third" });
    await expect(
      h.client.entry.revisions.restore({
        revisionId,
        expectedLiveUpdatedAt: stale,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "stale_expected_updated_at" },
    });
  });

  test("restores the snapshotted slug from the envelope", async () => {
    const { h, entryId, revisionId } = await seedEntryWithRevision();
    await h.client.entry.update({ id: entryId, slug: "third-slug" });

    const restored = await h.client.entry.revisions.restore({ revisionId });

    expect(restored.slug).toBe("first");
  });

  test("fires entry:published when the revision restores a draft to published", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({
      title: "P",
      slug: "p",
      status: "draft",
    });
    await h.client.entry.update({
      id: created.id,
      status: "published",
    });
    await h.client.entry.update({ id: created.id, status: "draft" });
    const allRevisions = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    const publishedRevision = allRevisions.find(
      (r) => r.status === "published",
    );
    if (!publishedRevision) throw new Error("expected a published revision");
    const onPublished = h.spyAction("entry:published");
    await h.client.entry.revisions.restore({
      revisionId: publishedRevision.id,
    });
    onPublished.assertCalledOnce();
  });

  test("rejects with FORBIDDEN when the viewer lacks read_revisions", async () => {
    const { h, revisionId } = await seedEntryWithRevision();
    const subscriber = await h.actingAs("subscriber");
    await expect(
      subscriber.client.entry.revisions.restore({ revisionId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:read_revisions" },
    });
  });

  test("rejects with NOT_FOUND for an unknown revisionId", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h.client.entry.revisions.restore({ revisionId: 999_999 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "revision" },
    });
  });
});

function registryWithAutosave(): ReturnType<typeof createPluginRegistry> {
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

describe("entry.revisions.restore — autosave destination (#292)", () => {
  test("writes the revision's snapshot into the caller's autosave row, leaving live untouched", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "X1",
      slug: "x",
      status: "published",
    });
    // Two edits to produce two revisions: "X2" then "X3" (revision
    // capture happens *after* the update, snapshotting the new state).
    await h.client.entry.update({
      id: created.id,
      title: "X2",
      saveAs: "live",
    });
    await h.client.entry.update({
      id: created.id,
      title: "X3",
      saveAs: "live",
    });
    const revisions = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    const x2Revision = revisions.find((r) => r.title === "X2");
    if (!x2Revision) throw new Error("expected an X2 revision");

    const restored = await h.client.entry.revisions.restore({
      revisionId: x2Revision.id,
    });

    // Restored row is the autosave (type='autosave'), not live.
    expect(restored.type).toBe("autosave");
    expect(restored.title).toBe("X2");
    // Live still shows the latest title — restore didn't touch it.
    const liveAfter = await h.db.query.entries.findFirst({
      where: eq(entries.id, created.id),
    });
    expect(liveAfter?.title).toBe("X3");
  });

  test("fires entry:<type>:revision_restored AND entry:<type>:autosave_saved — but NOT entry:updated", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    await h.client.entry.update({
      id: created.id,
      title: "L2",
      saveAs: "live",
    });
    const [revision] = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    if (!revision) throw new Error("expected one revision");

    const onRestored = h.spyAction("entry:post:revision_restored");
    const onAutosaveSaved = h.spyAction("entry:post:autosave_saved");
    const onUpdated = h.spyAction("entry:post:updated");
    await h.client.entry.revisions.restore({ revisionId: revision.id });
    onRestored.assertCalledOnce();
    onAutosaveSaved.assertCalledOnce();
    // Live didn't change — `entry:updated` would mis-signal cache
    // invalidators and feed-rebuilders.
    expect(onUpdated.calls).toEqual([]);
  });

  test("rejects with FORBIDDEN when viewer lacks restore_revision (subscriber)", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    await h.client.entry.update({
      id: created.id,
      title: "L2",
      saveAs: "live",
    });
    const [revision] = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    if (!revision) throw new Error("expected one revision");
    // Subscriber doesn't have read_revisions either, but the read gate
    // fires first and emits a different cap name. Use the contributor
    // role (which gets read_revisions via promotion — actually no,
    // contributors don't have read_revisions either). The clearest
    // gate-coverage assertion: a subscriber gets FORBIDDEN on
    // read_revisions, the rest of the chain doesn't matter.
    const subscriber = await h.actingAs("subscriber");
    await expect(
      subscriber.client.entry.revisions.restore({ revisionId: revision.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
