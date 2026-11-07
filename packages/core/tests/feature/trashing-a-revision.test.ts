import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

/**
 * An admin holds every registered capability, and the revision row is theirs
 * and already in the bin, so nothing but its type can refuse it.
 */
async function seedRevision() {
  const admin = await site.factory.admin.create();
  const live = await site.factory.trashed.create({
    authorId: admin.id,
    slug: "live",
  });
  const revision = await site.factory.trashed.create({
    authorId: admin.id,
    type: "revision",
    slug: `revision:${String(live.id)}:abcdefghijklmnopqrstu`,
  });
  return { admin, live, revision };
}

describe("the trash lifecycle refuses a revision as not found", () => {
  test("when trashing it", async () => {
    const { admin, revision } = await seedRevision();

    const trash = site.actingAs(admin).rpc.entry.trash({ id: revision.id });

    await expect(trash).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: revision.id },
    });
  });

  test("when restoring it", async () => {
    const { admin, revision } = await seedRevision();

    const restore = site.actingAs(admin).rpc.entry.restore({ id: revision.id });

    await expect(restore).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: revision.id },
    });
  });

  test("when deleting it permanently", async () => {
    const { admin, revision } = await seedRevision();

    const deletion = site
      .actingAs(admin)
      .rpc.entry.deletePermanent({ id: revision.id });

    await expect(deletion).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: revision.id },
    });
  });

  test("when trashing it in bulk beside a live entry", async () => {
    const { admin, live, revision } = await seedRevision();

    const trash = site
      .actingAs(admin)
      .rpc.entry.trashMany({ ids: [live.id, revision.id] });

    await expect(trash).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: revision.id },
    });
  });

  test("when restoring it in bulk beside a live entry", async () => {
    const { admin, live, revision } = await seedRevision();

    const restore = site
      .actingAs(admin)
      .rpc.entry.restoreMany({ ids: [live.id, revision.id] });

    await expect(restore).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: revision.id },
    });
  });

  test("when deleting it permanently in bulk beside a live entry", async () => {
    const { admin, live, revision } = await seedRevision();

    const deletion = site
      .actingAs(admin)
      .rpc.entry.deletePermanentMany({ ids: [live.id, revision.id] });

    await expect(deletion).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: revision.id },
    });
  });
});
