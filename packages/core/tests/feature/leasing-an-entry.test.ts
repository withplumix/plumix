import { describe, expect, test } from "vitest";

import { readEditLease } from "../../src/db/edit-lease.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

describe("acquiring an entry's edit lease", () => {
  test("leases the entry to the caller from the admin for 120 seconds", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.draft.create({ authorId: editor.id });

    const lease = await site
      .actingAs(editor)
      .rpc.entry.lease.acquire({ id: entry.id });

    expect(lease).toMatchObject({
      holder: { id: editor.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another editor holds it, the caller is refused with who and since when", async () => {
    site.freezeTime("2026-03-01T09:00:00Z");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const entry = await site.factory.draft.create({ authorId: ada.id });
    await site.actingAs(ada).rpc.entry.lease.acquire({ id: entry.id });

    const acquire = site
      .actingAs("editor")
      .rpc.entry.lease.acquire({ id: entry.id });

    await expect(acquire).rejects.toMatchObject({
      code: "LOCKED",
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-03-01T09:00:00Z"),
      },
    });
  });

  test("with takeOver, the caller replaces the editor holding it", async () => {
    const editor = await site.factory.editor.create();
    const ada = await site.factory.editor.create({ name: "Ada" });
    const entry = await site.factory.draft.create({ authorId: ada.id });
    await site.actingAs(ada).rpc.entry.lease.acquire({ id: entry.id });

    const lease = await site.actingAs(editor).rpc.entry.lease.acquire({
      id: entry.id,
      takeOver: true,
    });

    expect(lease.holder.id).toBe(editor.id);
  });

  test("a caller who can't edit the entry can't lease it", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const entry = await site.factory.draft.create({ authorId: ada.id });

    const acquire = site
      .actingAs("member")
      .rpc.entry.lease.acquire({ id: entry.id });

    await expect(acquire).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("renewing an entry's edit lease", () => {
  test("after another editor took over, the renewal reports who and when", async () => {
    site.freezeTime("2026-03-01T09:00:00Z");
    const editor = site.actingAs("editor");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const entry = await site.factory.draft.create({ authorId: ada.id });
    await editor.rpc.entry.lease.acquire({ id: entry.id });
    site.travel({ minutes: 1 });
    await site.actingAs(ada).rpc.entry.lease.acquire({
      id: entry.id,
      takeOver: true,
    });

    const renewal = await editor.rpc.entry.lease.renew({ id: entry.id });

    expect(renewal).toEqual({
      lost: {
        by: { id: ada.id, name: "Ada" },
        at: new Date("2026-03-01T09:01:00Z"),
      },
    });
  });
});

describe("releasing an entry's edit lease", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    site.freezeTime("2026-03-01T09:00:00Z");
    const editor = site.actingAs("editor");
    const entry = await site.factory.draft.create();
    await editor.rpc.entry.lease.acquire({ id: entry.id });

    await editor.rpc.entry.lease.release({ id: entry.id });

    expect(
      await readEditLease(
        site.context.db,
        { kind: "entry", id: entry.id },
        new Date("2026-03-01T09:00:30Z"),
      ),
    ).toBeUndefined();
  });
});
