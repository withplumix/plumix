import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import { createRpcHarness } from "../test/rpc.js";

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

describe("entry.revisions.list", () => {
  test("editor can list a post's revisions newest-first with hydrated author info", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({ title: "P", slug: "p" });
    await h.client.entry.update({ id: created.id, title: "P2" });
    await h.client.entry.update({ id: created.id, title: "P3" });

    const out = await h.client.entry.revisions.list({ entryId: created.id });
    expect(out.revisions).toHaveLength(2);
    const [newest, older] = out.revisions;
    if (!newest || !older) throw new Error("expected 2 revisions");
    expect(newest.title).toBe("P3");
    expect(older.title).toBe("P2");
    expect(newest.authorId).toBe(h.user.id);
    expect(newest.authorEmail).toBe(h.user.email);
  });

  test("contributor without read_revisions gets FORBIDDEN", async () => {
    const h = await createRpcHarness({
      authAs: "contributor",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({ title: "P", slug: "p" });
    await expect(
      h.client.entry.revisions.list({ entryId: created.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:read_revisions" },
    });
  });

  test("unknown entryId returns NOT_FOUND", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h.client.entry.revisions.list({ entryId: 99999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("pagination across cursor returns disjoint pages", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({ title: "P", slug: "p" });
    for (let i = 0; i < 5; i += 1) {
      await h.client.entry.update({ id: created.id, title: `v${i}` });
    }
    const page1 = await h.client.entry.revisions.list({
      entryId: created.id,
      limit: 2,
    });
    expect(page1.revisions).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await h.client.entry.revisions.list({
      entryId: created.id,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.revisions).toHaveLength(2);
    const ids1 = page1.revisions.map((r) => r.id);
    const ids2 = page2.revisions.map((r) => r.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });
});

describe("entry.revisions.get", () => {
  test("editor can read a single revision", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({ title: "G", slug: "g" });
    await h.client.entry.update({ id: created.id, title: "G2" });
    const listed = await h.client.entry.revisions.list({
      entryId: created.id,
    });
    const [first] = listed.revisions;
    if (!first) throw new Error("expected at least one revision");
    const fetched = await h.client.entry.revisions.get({
      revisionId: first.id,
    });
    expect(fetched.id).toBe(first.id);
    expect(fetched.title).toBe("G2");
    // Author join: the editor preview banner needs name/email so it
    // can render "by <author>" without a second user roundtrip.
    expect(fetched.authorName).toBe(first.authorName);
    expect(fetched.authorEmail).toBe(first.authorEmail);
  });

  test("contributor gets FORBIDDEN on entry.revisions.get", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({ title: "G", slug: "g" });
    await h.client.entry.update({ id: created.id, title: "G2" });
    const listed = await h.client.entry.revisions.list({
      entryId: created.id,
    });
    const [first] = listed.revisions;
    if (!first) throw new Error("expected at least one revision");
    const revisionId = first.id;

    const h2 = await createRpcHarness({
      authAs: "contributor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h2.client.entry.revisions.get({ revisionId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
