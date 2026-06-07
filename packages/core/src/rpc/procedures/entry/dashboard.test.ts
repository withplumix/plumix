import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

// Stats/activity scope to *registered* entry types, so the harness needs
// a `post` type registered (the default empty registry has none).
function postRegistry() {
  const registry = createPluginRegistry();
  registry.entryTypes.set("post", {
    name: "post",
    registeredBy: "test",
    label: "Posts",
    capabilityType: "post",
  });
  return registry;
}

describe("entry.stats", () => {
  test("returns per-type counts grouped by status", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: postRegistry(),
    });
    await h.factory.published.create({ authorId: h.user.id, slug: "p1" });
    await h.factory.published.create({ authorId: h.user.id, slug: "p2" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "d1" });
    await h.factory.trashed.create({ authorId: h.user.id, slug: "t1" });

    const stats = await h.client.entry.stats();
    const post = stats.filter((s) => s.type === "post");
    const byStatus = Object.fromEntries(post.map((s) => [s.status, s.count]));
    expect(byStatus.published).toBe(2);
    expect(byStatus.draft).toBe(1);
    expect(byStatus.trash).toBe(1);
  });

  test("never counts reserved (revision/autosave) rows", async () => {
    const h = await createRpcHarness({
      authAs: "admin",
      plugins: postRegistry(),
    });
    await h.factory.published.create({ authorId: h.user.id, slug: "vis" });
    await h.factory.entry.create({
      authorId: h.user.id,
      type: "revision",
      slug: "revision:1:abcdefghijklmnopqrstu",
    });
    const stats = await h.client.entry.stats();
    expect(stats.some((s) => s.type === "revision")).toBe(false);
  });

  test("a read-only caller sees published counts but not drafts or trash", async () => {
    // Subscriber has entry:post:read but not edit_any — draft/trash counts
    // must stay hidden, matching entry.list / entry.get visibility.
    const h = await createRpcHarness({
      authAs: "subscriber",
      plugins: postRegistry(),
    });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "dr" });
    await h.factory.trashed.create({ authorId: h.user.id, slug: "tr" });

    const stats = await h.client.entry.stats();
    const byStatus = Object.fromEntries(
      stats.filter((s) => s.type === "post").map((s) => [s.status, s.count]),
    );
    expect(byStatus.published).toBe(1);
    expect(byStatus.draft).toBeUndefined();
    expect(byStatus.trash).toBeUndefined();
  });
});

describe("entry.recentActivity", () => {
  test("returns recent non-trashed entries newest-first, capped by limit", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: postRegistry(),
    });
    await h.factory.published.create({ authorId: h.user.id, slug: "old" });
    await h.factory.published.create({ authorId: h.user.id, slug: "new" });
    await h.factory.trashed.create({ authorId: h.user.id, slug: "binned" });

    const recent = await h.client.entry.recentActivity({ limit: 10 });
    expect(recent.some((r) => r.slug === "binned")).toBe(false);
    expect(recent.length).toBe(2);
    // Newest-first: the later-created row sorts ahead.
    expect(recent[0]?.slug).toBe("new");
  });
});
