import { describe, expect, test } from "vitest";

import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredEntryType } from "../plugin/registry.js";
import { createRpcHarness } from "../test/rpc.js";
import { buildRevisionSlug, REVISION_TYPE } from "./slug-codec.js";

function registryWithRevisions() {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set(
    "post",
    toRegisteredEntryType(
      "post",
      {
        label: "Posts",
        supports: ["revisions"],
        versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
      },
      "test",
    ),
  );
  return plugins;
}

describe("public entry RPCs reject the reserved revision type", () => {
  test("entry.list rejects type='revision' with BAD_REQUEST", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h.client.entry.list({ type: "revision" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("entry.create rejects type='revision' with BAD_REQUEST", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h.client.entry.create({ type: "revision", title: "x", slug: "x" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("entry.get on a revision row returns NOT_FOUND (undistinguished from missing)", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    // Seed a revision row directly via DB.
    const [revision] = await h.db
      .insert(entries)
      .values({
        type: REVISION_TYPE,
        title: "snap",
        slug: buildRevisionSlug({ entryId: 999, nanoid: "abc" }),
        authorId: h.user.id,
        status: "draft",
      })
      .returning();
    if (!revision) throw new Error("seed revision");
    await expect(h.client.entry.get({ id: revision.id })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });
});

describe("a revision row's id is not-found to every procedure loading a live entry", () => {
  // An admin holds every registered capability, so nothing but the row's type
  // can be what refuses it.
  async function seedRevision() {
    const h = await createRpcHarness({
      authAs: "admin",
      plugins: registryWithRevisions(),
    });
    const live = await h.factory.published.create({
      authorId: h.user.id,
      slug: "live",
    });
    const revision = await h.factory.published.create({
      authorId: h.user.id,
      type: REVISION_TYPE,
      slug: buildRevisionSlug({ entryId: live.id, nanoid: "abc" }),
    });
    return { h, revision };
  }

  const calls = {
    update: (h, id) => h.client.entry.update({ id, title: "x" }),
    publish: (h, id) =>
      h.client.entry.publish({ id, expectedLiveUpdatedAt: new Date() }),
    discardDraft: (h, id) => h.client.entry.discardDraft({ id }),
    duplicate: (h, id) => h.client.entry.duplicate({ id }),
    createPreviewLink: (h, id) => h.client.entry.createPreviewLink({ id }),
    refreshBlockLoader: (h, id) =>
      h.client.entry.refreshBlockLoader({ id, blockId: "b" }),
    "activity.list": (h, id) => h.client.entry.activity.list({ entryId: id }),
    "revisions.list": (h, id) => h.client.entry.revisions.list({ entryId: id }),
  } satisfies Record<
    string,
    (
      h: Awaited<ReturnType<typeof seedRevision>>["h"],
      id: number,
    ) => Promise<unknown>
  >;

  test.each(Object.entries(calls))("%s", async (_name, call) => {
    const { h, revision } = await seedRevision();
    await expect(call(h, revision.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("revisions.get, when the revision's slug names another revision", async () => {
    const { h, revision } = await seedRevision();
    const nested = await h.factory.published.create({
      authorId: h.user.id,
      type: REVISION_TYPE,
      slug: buildRevisionSlug({ entryId: revision.id, nanoid: "def" }),
    });
    await expect(
      h.client.entry.revisions.get({ revisionId: nested.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
