import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createRpcHarness } from "../test/rpc.js";

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

describe("entry.activity.list", () => {
  test("returns empty list when no autosave rows exist for the entry", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    const result = await h.client.entry.activity.list({ entryId: created.id });
    expect(result.users).toEqual([]);
  });

  test("excludes the calling user's own autosave row from the list", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    // Caller writes their own autosave — should NOT appear in their
    // own activity list.
    await h.client.entry.update({
      id: created.id,
      title: "My pending",
      saveAs: "draft",
    });
    const result = await h.client.entry.activity.list({ entryId: created.id });
    expect(result.users).toEqual([]);
  });

  test("returns a co-author who has an autosave row touched within the 5-minute window", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    // Second editor writes an autosave.
    const second = await h.actingAs("editor");
    await second.client.entry.update({
      id: created.id,
      title: "Their pending",
      saveAs: "draft",
    });

    const result = await h.client.entry.activity.list({ entryId: created.id });
    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.id).toBe(second.user.id);
    expect(result.users[0]?.email).toBe(second.user.email);
  });

  test("filters out autosave rows older than 5 minutes", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    const second = await h.actingAs("editor");
    await second.client.entry.update({
      id: created.id,
      title: "Their pending",
      saveAs: "draft",
    });
    // Backdate the second user's autosave to 10 minutes ago.
    const SIX_MINUTES_MS = 6 * 60 * 1000;
    const longAgo = new Date(Date.now() - SIX_MINUTES_MS);
    await h.db
      .update(entries)
      .set({ updatedAt: longAgo })
      .where(eq(entries.authorId, second.user.id));

    const result = await h.client.entry.activity.list({ entryId: created.id });
    expect(result.users).toEqual([]);
  });

  test("subscriber gets FORBIDDEN — same gate as entry.revisions.list", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    const created = await h.client.entry.create({
      title: "L",
      slug: "l",
      status: "published",
    });
    const subscriber = await h.actingAs("subscriber");
    await expect(
      subscriber.client.entry.activity.list({ entryId: created.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:read_revisions" },
    });
  });

  test("NOT_FOUND on an unknown entry id (existence not observable through the activity endpoint)", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithAutosave(),
    });
    await expect(
      h.client.entry.activity.list({ entryId: 999_999 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry" },
    });
  });
});
