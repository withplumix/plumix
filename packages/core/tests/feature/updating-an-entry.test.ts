import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    // A plugin trying to hand the `locked` entry to someone else.
    ctx.filters.add(entry.beforeSave, async (row, _input, { db }) => {
      if (row.slug !== "locked") return row;
      const [impostor] = await db
        .select()
        .from(users)
        .where(eq(users.email, "impostor@example.test"));
      if (!impostor) throw new Error("the impostor is seeded by the test");
      return { ...row, authorId: impostor.id, type: "leaked" };
    });
  },
});

const site = await testSite({ plugins: [posts] });

describe("updating an entry", () => {
  test("an empty title clears it, since entries may be untitled", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      title: "Has a title",
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.title).toBe("");
  });

  test("to a slug another entry of its type holds is refused as a conflict", async () => {
    const author = await site.factory.author.create();
    await site.factory.draft.create({ authorId: author.id, slug: "taken" });
    const mine = await site.factory.draft.create({
      authorId: author.id,
      slug: "mine",
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: mine.id,
      slug: "taken",
      ifMatch: etagOf(mine.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("with an empty patch changes nothing and emits no entry.updated", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const returned = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(returned.id).toBe(own.id);
    site.events.assertNotEmitted(entry.updated);
  });

  test("that doesn't exist is not found", async () => {
    const update = site.actingAs("admin").rpc.entry.update({
      id: 9999,
      title: "x",
      ifMatch: etagOf(new Date("2026-10-18T12:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("keeps its author and type when an entry.beforeSave handler rewrites them", async () => {
    const author = await site.factory.author.create();
    await site.factory.admin.create({ email: "impostor@example.test" });
    const own = await site.factory.draft.create({
      authorId: author.id,
      slug: "locked",
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "renamed",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.authorId).toBe(author.id);
    expect(updated.type).toBe("post");
    expect(updated.title).toBe("renamed");
  });

  test("stores a plumix.v2 content envelope", async () => {
    // The v1 validator would refuse this envelope at its root, so a round
    // trip proves the v2 path was taken.
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const content = {
      version: "plumix.v2",
      blocks: [
        { id: "p1", name: "core/rich-text", attrs: { body: "<p>Hello</p>" } },
      ],
    };

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });
});

describe("reparenting an entry", () => {
  test("under an entry the caller cannot read is not found", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });
    const hidden = await site.factory.admin.create();
    const secret = await site.factory.draft.create({ authorId: hidden.id });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      parentId: secret.id,
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: secret.id },
    });
  });

  test("under itself is refused as a parent cycle", async () => {
    const admin = site.actingAs("admin");
    const self = await admin.rpc.entry.create({
      type: "post",
      title: "self",
      slug: "self",
      status: "published",
    });

    const update = admin.rpc.entry.update({
      id: self.id,
      parentId: self.id,
      ifMatch: self.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("under its own child is refused as a parent cycle (A→B→A)", async () => {
    const admin = site.actingAs("admin");
    const a = await admin.rpc.entry.create({
      type: "post",
      title: "a",
      slug: "a",
      status: "published",
    });
    const b = await admin.rpc.entry.create({
      type: "post",
      title: "b",
      slug: "b",
      status: "published",
      parentId: a.id,
    });

    const update = admin.rpc.entry.update({
      id: a.id,
      parentId: b.id,
      ifMatch: a.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("under its own grandchild is refused as a parent cycle (A→B→C→A)", async () => {
    const admin = site.actingAs("admin");
    const a = await admin.rpc.entry.create({
      type: "post",
      title: "a",
      slug: "a",
      status: "published",
    });
    const b = await admin.rpc.entry.create({
      type: "post",
      title: "b",
      slug: "b",
      status: "published",
      parentId: a.id,
    });
    const c = await admin.rpc.entry.create({
      type: "post",
      title: "c",
      slug: "c",
      status: "published",
      parentId: b.id,
    });

    const update = admin.rpc.entry.update({
      id: a.id,
      parentId: c.id,
      ifMatch: a.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });
});
