import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { readEditLease } from "../../src/db/edit-lease.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
  },
});

const site = await testSite({ plugins: [posts] });

describe("updating an entry another editor holds the lease on", () => {
  test("while the lease is live is refused with who holds it since when", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const held = await site.factory.draft.create({ authorId: ada.id });
    await site.actingAs(ada).rpc.entry.lease.acquire({ id: held.id });

    const update = site.actingAs("editor").rpc.entry.update({
      id: held.id,
      title: "mine",
      ifMatch: etagOf(held.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "LOCKED",
      status: 423,
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-10-18T12:00:00Z"),
      },
    });
  });

  test("after the lease lapsed lands", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const held = await site.factory.draft.create({ authorId: ada.id });
    await site.actingAs(ada).rpc.entry.lease.acquire({ id: held.id });
    site.travel({ minutes: 3 });

    const saved = await site.actingAs("editor").rpc.entry.update({
      id: held.id,
      title: "mine",
      ifMatch: etagOf(held.updatedAt),
    });

    expect(saved.title).toBe("mine");
  });

  test("with takeOver lands and takes the lease over", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const editor = await site.factory.editor.create();
    const held = await site.factory.draft.create({ authorId: ada.id });
    await site.actingAs(ada).rpc.entry.lease.acquire({ id: held.id });

    const saved = await site.actingAs(editor).rpc.entry.update({
      id: held.id,
      title: "mine",
      ifMatch: etagOf(held.updatedAt),
      takeOver: true,
    });

    expect(saved.title).toBe("mine");
    expect(
      await readEditLease(site.context.db, { kind: "entry", id: held.id }),
    ).toMatchObject({ holder: { id: editor.id } });
  });
});

describe("updating an entry from a stale copy while holding its lease", () => {
  test("names the lease's holder in the conflict", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const held = await site.factory.draft.create({ authorId: ada.id });
    const asAda = site.actingAs(ada);
    await asAda.rpc.entry.lease.acquire({ id: held.id });

    const update = asAda.rpc.entry.update({
      id: held.id,
      title: "from a stale tab",
      ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: ada.id, name: "Ada" } },
    });
  });
});
