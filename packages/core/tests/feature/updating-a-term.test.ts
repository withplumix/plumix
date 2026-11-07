import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { readEditLease } from "../../src/db/edit-lease.js";
import { eq } from "../../src/db/index.js";
import { terms } from "../../src/db/schema/terms.js";
import { term } from "../../src/hooks/term.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const categories = definePlugin("categories", {
  setup: (ctx) => {
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      isHierarchical: true,
    });
    ctx.registerTermMetaBox("category-icon", {
      label: "Icon",
      termTaxonomies: ["category"],
      fields: [text("icon")],
    });
  },
});

const site = await testSite({ plugins: [categories] });

describe("updating a term", () => {
  test("by an editor renames it", async () => {
    const row = await site.factory.category.create({
      name: "Old",
      slug: "old",
    });

    const updated = await site.actingAs("editor").rpc.term.update({
      id: row.id,
      name: "New Name",
      ifMatch: etagOf(row.version),
    });

    expect(updated.name).toBe("New Name");
  });

  test("by a member is forbidden", async () => {
    const row = await site.factory.category.create({
      name: "Name",
      slug: "name",
    });

    await expect(
      site.actingAs("member").rpc.term.update({
        id: row.id,
        name: "Hax",
        ifMatch: etagOf(row.version),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("to be its own parent conflicts", async () => {
    const row = await site.factory.category.create({
      name: "Self",
      slug: "self",
    });

    await expect(
      site.actingAs("editor").rpc.term.update({
        id: row.id,
        parentId: row.id,
        ifMatch: etagOf(row.version),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_is_self" },
    });
  });

  test("to sit under its own descendant conflicts as a cycle", async () => {
    // A -> B -> C (B's parent is A; C's parent is B).
    const a = await site.factory.category.create({ name: "A", slug: "a" });
    const b = await site.factory.category.create({
      name: "B",
      slug: "b",
      parentId: a.id,
    });
    const c = await site.factory.category.create({
      name: "C",
      slug: "c",
      parentId: b.id,
    });

    // A.parent = C would form the cycle A -> C -> B -> A.
    await expect(
      site.actingAs("editor").rpc.term.update({
        id: a.id,
        parentId: c.id,
        ifMatch: etagOf(a.version),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("to a slug another term of the taxonomy holds conflicts", async () => {
    const a = await site.factory.category.create({ name: "A", slug: "a-slug" });
    await site.factory.category.create({ name: "B", slug: "b-slug" });

    await expect(
      site.actingAs("editor").rpc.term.update({
        id: a.id,
        slug: "b-slug",
        ifMatch: etagOf(a.version),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });
});

describe("updating a term from a copy", () => {
  test("a save from the current copy lands and answers with the next etag", async () => {
    const editor = site.actingAs("editor");
    const created = await editor.rpc.term.create({
      taxonomy: "category",
      name: "Old",
      slug: "old",
    });

    const saved = await editor.rpc.term.update({
      id: created.id,
      name: "New",
      ifMatch: created.etag,
    });

    expect(saved.etag).not.toBe(created.etag);
    expect(saved).not.toHaveProperty("version");
    expect((await editor.rpc.term.get({ id: created.id })).etag).toBe(
      saved.etag,
    );
  });

  test("a save from a stale copy conflicts and leaves name and meta unchanged", async () => {
    const editor = site.actingAs("editor");
    const created = await editor.rpc.term.create({
      taxonomy: "category",
      name: "Original",
      slug: "original",
      meta: { icon: "leaf" },
    });
    const theirs = await editor.rpc.term.update({
      id: created.id,
      name: "Theirs",
      ifMatch: created.etag,
    });

    await expect(
      editor.rpc.term.update({
        id: created.id,
        name: "Mine",
        meta: { icon: "rock" },
        ifMatch: created.etag,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: theirs.etag },
    });
    const [row] = await site.context.db
      .select({ name: terms.name, meta: terms.meta })
      .from(terms)
      .where(eq(terms.id, created.id));
    expect(row).toEqual({ name: "Theirs", meta: { icon: "leaf" } });
  });

  test("a meta-only save moves the token", async () => {
    const editor = site.actingAs("editor");
    const created = await editor.rpc.term.create({
      taxonomy: "category",
      name: "Original",
      slug: "original",
    });

    const saved = await editor.rpc.term.update({
      id: created.id,
      meta: { icon: "leaf" },
      ifMatch: created.etag,
    });

    expect(saved.meta).toEqual({ icon: "leaf" });
    await expect(
      editor.rpc.term.update({
        id: created.id,
        meta: { icon: "rock" },
        ifMatch: created.etag,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("two saves from one copy at once: one lands, the other conflicts", async () => {
    const editor = site.actingAs("editor");
    const row = await site.factory.category.create();
    const ifMatch = etagOf(row.version);

    const results = await Promise.allSettled([
      editor.rpc.term.update({ id: row.id, name: "First", ifMatch }),
      editor.rpc.term.update({ id: row.id, name: "Second", ifMatch }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.filter((r) => r.status === "rejected");
    expect(refused?.reason).toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: etagOf(row.version + 1) },
    });
  });

  test("a meta-only save announces the meta change, not a row update", async () => {
    const row = await site.factory.category.create();

    await site.actingAs("editor").rpc.term.update({
      id: row.id,
      meta: { icon: "leaf" },
      ifMatch: etagOf(row.version),
    });

    site.events.assertNotEmitted(term.updated);
    expect(site.events.emitted(term.metaChanged)).toHaveLength(1);
  });

  test("a save without ifMatch is refused with where to find the etag", async () => {
    const row = await site.factory.category.create();

    await expect(
      // @ts-expect-error -- the caller left out its copy's token
      site.actingAs("editor").rpc.term.update({ id: row.id, name: "no-token" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        issues: [
          { message: "Send the term's `etag` from `term.get` as `ifMatch`" },
        ],
      },
    });
  });
});

describe("updating a term under an edit lease", () => {
  test("another editor's save during a live lease is refused with who holds it", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const row = await site.factory.category.create();
    await site.actingAs(ada).rpc.term.lease.acquire({ id: row.id });

    await expect(
      site.actingAs("editor").rpc.term.update({
        id: row.id,
        name: "mine",
        ifMatch: etagOf(row.version),
      }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-10-19T12:00:00Z"),
      },
    });
  });

  test("a save that passes takeOver lands and takes the lease over", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const editor = await site.factory.editor.create();
    const row = await site.factory.category.create();
    await site.actingAs(ada).rpc.term.lease.acquire({ id: row.id });

    const saved = await site.actingAs(editor).rpc.term.update({
      id: row.id,
      name: "mine",
      ifMatch: etagOf(row.version),
      takeOver: true,
    });

    expect(saved.name).toBe("mine");
    expect(
      await readEditLease(
        site.context.db,
        { kind: "term", id: row.id },
        new Date("2026-10-19T12:00:00Z"),
      ),
    ).toMatchObject({ holder: { id: editor.id } });
  });

  test("a stale save names who holds the lease in its conflict", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const row = await site.factory.category.create();
    const asAda = site.actingAs(ada);
    await asAda.rpc.term.lease.acquire({ id: row.id });

    await expect(
      asAda.rpc.term.update({
        id: row.id,
        name: "from a stale tab",
        ifMatch: etagOf(row.version + 5),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: ada.id, name: "Ada" } },
    });
  });
});
