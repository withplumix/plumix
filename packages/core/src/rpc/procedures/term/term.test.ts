import { describe, expect, test } from "vitest";

import type { UserRole } from "../../../db/schema/users.js";
import type { MutablePluginRegistry } from "../../../plugin/manifest.js";
import { rolesFromRank } from "../../../access/contract/rbac.js";
import { etagOf } from "../../../db/concurrency.js";
import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { eq, inArray } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { text } from "../../../plugin/fields/builder.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { toRegisteredTermTaxonomy } from "../../../plugin/registry.js";
import { editorUser } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";

/**
 * "category" is the canonical hierarchical taxonomy in WP; used here as the
 * fixture because term RPC requires a registered taxonomy to operate.
 */
function taxonomyRegistry() {
  const registry = createPluginRegistry();
  registry.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy(
      "category",
      { label: "Categories", isHierarchical: true },
      "test",
    ),
  );
  const caps: Record<string, UserRole> = {
    "term:category:read": "subscriber",
    "term:category:assign": "contributor",
    "term:category:edit": "editor",
    "term:category:delete": "editor",
  };
  for (const [name, minRole] of Object.entries(caps)) {
    registry.capabilities.set(name, {
      name,
      grantTo: rolesFromRank(minRole),
      registeredBy: "test",
    });
  }
  return registry;
}

function withIconField(plugins: MutablePluginRegistry): MutablePluginRegistry {
  plugins.termMetaBoxes.set("test-category", {
    id: "test-category",
    label: "Test",
    termTaxonomies: ["category"],
    fields: [text("icon").build()],
    registeredBy: "test",
  });
  return plugins;
}

describe("term.list", () => {
  test("returns terms in the requested taxonomy", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    await h.factory.term.create({
      taxonomy: "category",
      name: "Alpha",
      slug: "alpha",
    });
    await h.factory.term.create({
      taxonomy: "category",
      name: "Beta",
      slug: "beta",
    });

    const rows = await h.client.term.list({ taxonomy: "category" });
    expect(rows.map((r) => r.slug).sort()).toEqual(["alpha", "beta"]);
  });

  test("unregistered taxonomy is NOT_FOUND (signals 'no such taxonomy')", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "admin", plugins });
    await expect(
      h.client.term.list({ taxonomy: "unknown" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "taxonomy", id: "unknown" },
    });
  });

  test("parentId=null returns only top-level terms", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    const root = await h.factory.term.create({
      taxonomy: "category",
      name: "Root",
      slug: "root",
    });
    await h.factory.term.create({
      taxonomy: "category",
      name: "Child",
      slug: "child",
      parentId: root.id,
    });
    const top = await h.client.term.list({
      taxonomy: "category",
      parentId: null,
    });
    expect(top.map((r) => r.slug)).toEqual(["root"]);
  });
});

describe("term.get", () => {
  test("returns the term", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    const row = await h.factory.term.create({
      taxonomy: "category",
      name: "Got",
      slug: "got",
    });

    const got = await h.client.term.get({ id: row.id });
    expect(got.slug).toBe("got");
  });

  test("404 when the term does not exist", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    await expect(h.client.term.get({ id: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "term", id: 9999 },
    });
  });
});

describe("term.create", () => {
  test("announces the meta it was created with, and only then", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: withIconField(taxonomyRegistry()),
    });
    const metaChanged = h.spyAction("term:meta_changed");

    await h.client.term.create({
      taxonomy: "category",
      name: "With",
      slug: "with",
      meta: { icon: "leaf" },
    });
    await h.client.term.create({
      taxonomy: "category",
      name: "Without",
      slug: "without",
    });

    expect(metaChanged.calls.map((call) => call.args[1])).toEqual([
      { set: { icon: "leaf" }, removed: [] },
    ]);
  });

  test("editor can create a term", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const created = await h.client.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    expect(created.slug).toBe("news");
  });

  test("author cannot create (cap is editor+)", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "author", plugins });
    await expect(
      h.client.term.create({
        taxonomy: "category",
        name: "Nope",
        slug: "nope",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("slug collision within taxonomy → CONFLICT", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    await h.client.term.create({
      taxonomy: "category",
      name: "Dup",
      slug: "dup",
    });
    await expect(
      h.client.term.create({
        taxonomy: "category",
        name: "Dup2",
        slug: "dup",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("parent in a different taxonomy → CONFLICT", async () => {
    const plugins = taxonomyRegistry();
    plugins.termTaxonomies.set(
      "post_tag",
      toRegisteredTermTaxonomy("post_tag", { label: "Tags" }, "test"),
    );
    plugins.capabilities.set("term:post_tag:edit", {
      name: "term:post_tag:edit",
      grantTo: rolesFromRank("editor"),
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const otherTaxRow = await h.factory.term.create({
      taxonomy: "post_tag",
      name: "Tag",
      slug: "tag-1",
    });
    await expect(
      h.client.term.create({
        taxonomy: "category",
        name: "Child",
        slug: "child",
        parentId: otherTaxRow.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_mismatch" },
    });
  });
});

describe("term.update", () => {
  test("editor can rename a term", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const row = await h.factory.term.create({
      taxonomy: "category",
      name: "Old",
      slug: "old",
    });
    const updated = await h.client.term.update({
      id: row.id,
      name: "New Name",
      ifMatch: etagOf(row.version),
    });
    expect(updated.name).toBe("New Name");
  });

  test("subscriber cannot update", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    const row = await h.factory.term.create({
      taxonomy: "category",
      name: "Name",
      slug: "name",
    });
    await expect(
      h.client.term.update({
        id: row.id,
        name: "Hax",
        ifMatch: etagOf(row.version),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("setting parent = self → CONFLICT (parent_is_self)", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const row = await h.factory.term.create({
      taxonomy: "category",
      name: "Self",
      slug: "self",
    });
    await expect(
      h.client.term.update({
        id: row.id,
        parentId: row.id,
        ifMatch: etagOf(row.version),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_is_self" },
    });
  });

  test("cycle detection rejects setting parent to a descendant", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    // A -> B -> C (B's parent is A; C's parent is B).
    const a = await h.factory.term.create({
      taxonomy: "category",
      name: "A",
      slug: "a",
    });
    const b = await h.factory.term.create({
      taxonomy: "category",
      name: "B",
      slug: "b",
      parentId: a.id,
    });
    const c = await h.factory.term.create({
      taxonomy: "category",
      name: "C",
      slug: "c",
      parentId: b.id,
    });
    // Attempting A.parent = C would form a cycle A -> C -> B -> A.
    await expect(
      h.client.term.update({
        id: a.id,
        parentId: c.id,
        ifMatch: etagOf(a.version),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("slug collision on update → CONFLICT", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const a = await h.factory.term.create({
      taxonomy: "category",
      name: "A",
      slug: "a-slug",
    });
    await h.factory.term.create({
      taxonomy: "category",
      name: "B",
      slug: "b-slug",
    });
    await expect(
      h.client.term.update({
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

describe("term.update from a copy", () => {
  test("a save from the current copy lands and answers with the next etag", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const created = await h.client.term.create({
      taxonomy: "category",
      name: "Old",
      slug: "old",
    });

    const saved = await h.client.term.update({
      id: created.id,
      name: "New",
      ifMatch: created.etag,
    });

    expect(saved.etag).not.toBe(created.etag);
    expect(saved).not.toHaveProperty("version");
    expect((await h.client.term.get({ id: created.id })).etag).toBe(saved.etag);
  });

  test("a save from a stale copy conflicts and leaves name and meta unchanged", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: withIconField(taxonomyRegistry()),
    });
    const created = await h.client.term.create({
      taxonomy: "category",
      name: "Original",
      slug: "original",
      meta: { icon: "leaf" },
    });
    const theirs = await h.client.term.update({
      id: created.id,
      name: "Theirs",
      ifMatch: created.etag,
    });

    await expect(
      h.client.term.update({
        id: created.id,
        name: "Mine",
        meta: { icon: "rock" },
        ifMatch: created.etag,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: theirs.etag },
    });
    const [row] = await h.db
      .select({ name: terms.name, meta: terms.meta })
      .from(terms)
      .where(eq(terms.id, created.id));
    expect(row).toEqual({ name: "Theirs", meta: { icon: "leaf" } });
  });

  test("a meta-only save moves the token", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: withIconField(taxonomyRegistry()),
    });
    const created = await h.client.term.create({
      taxonomy: "category",
      name: "Original",
      slug: "original",
    });

    const saved = await h.client.term.update({
      id: created.id,
      meta: { icon: "leaf" },
      ifMatch: created.etag,
    });

    expect(saved.meta).toEqual({ icon: "leaf" });
    await expect(
      h.client.term.update({
        id: created.id,
        meta: { icon: "rock" },
        ifMatch: created.etag,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("two saves from one copy at once: one lands, the other conflicts", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const row = await h.factory.term.create({ taxonomy: "category" });
    const ifMatch = etagOf(row.version);

    const results = await Promise.allSettled([
      h.client.term.update({ id: row.id, name: "First", ifMatch }),
      h.client.term.update({ id: row.id, name: "Second", ifMatch }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.filter((r) => r.status === "rejected");
    expect(refused?.reason).toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: etagOf(row.version + 1) },
    });
  });

  test("a meta-only save announces the meta change, not a row update", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: withIconField(taxonomyRegistry()),
    });
    const row = await h.factory.term.create({ taxonomy: "category" });
    const updated = h.spyAction("term:updated");
    const metaChanged = h.spyAction("term:meta_changed");

    await h.client.term.update({
      id: row.id,
      meta: { icon: "leaf" },
      ifMatch: etagOf(row.version),
    });

    expect(updated.calls).toHaveLength(0);
    expect(metaChanged.calls).toHaveLength(1);
  });

  test("a save without ifMatch is refused with where to find the etag", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const row = await h.factory.term.create({ taxonomy: "category" });

    await expect(
      // @ts-expect-error -- the caller left out its copy's token
      h.client.term.update({ id: row.id, name: "no-token" }),
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

describe("term.update under an edit lease", () => {
  test("another editor's save during a live lease is refused with who holds it", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const row = await h.factory.term.create({ taxonomy: "category" });
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "term", id: row.id },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.term.update({
        id: row.id,
        name: "mine",
        ifMatch: etagOf(row.version),
      }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("a save that passes takeOver lands and takes the lease over", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const row = await h.factory.term.create({ taxonomy: "category" });
    await acquireEditLease(
      h.db,
      { kind: "term", id: row.id },
      { userId: ada.id, surface: "admin" },
    );

    const saved = await h.client.term.update({
      id: row.id,
      name: "mine",
      ifMatch: etagOf(row.version),
      takeOver: true,
    });

    expect(saved.name).toBe("mine");
    expect(
      await readEditLease(h.db, { kind: "term", id: row.id }),
    ).toMatchObject({ holder: { id: h.user.id } });
  });

  test("a stale save names who holds the lease in its conflict", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    const row = await h.factory.term.create({ taxonomy: "category" });
    await acquireEditLease(
      h.db,
      { kind: "term", id: row.id },
      { userId: ada.id, surface: "admin" },
    );

    await expect(
      asAda.client.term.update({
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

describe("term.delete", () => {
  test("editor can delete a term; children have parentId nulled", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const parent = await h.factory.term.create({
      taxonomy: "category",
      name: "P",
      slug: "p",
    });
    const child = await h.factory.term.create({
      taxonomy: "category",
      name: "C",
      slug: "c",
      parentId: parent.id,
    });

    await h.client.term.delete({ id: parent.id });

    const orphan = await h.context.db.query.terms.findFirst({
      where: eq(terms.id, child.id),
    });
    expect(orphan?.parentId).toBeNull();
  });

  test("re-parenting the children moves each child's token", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const parent = await h.factory.term.create({ taxonomy: "category" });
    const first = await h.factory.term.create({
      taxonomy: "category",
      parentId: parent.id,
    });
    const second = await h.factory.term.create({
      taxonomy: "category",
      parentId: parent.id,
    });

    await h.client.term.delete({ id: parent.id });

    const versions = await h.context.db
      .select({ id: terms.id, version: terms.version })
      .from(terms)
      .where(inArray(terms.id, [first.id, second.id]))
      .orderBy(terms.id);
    expect(versions).toEqual([
      { id: first.id, version: first.version + 1 },
      { id: second.id, version: second.version + 1 },
    ]);
  });

  test("author cannot delete", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "author", plugins });
    const row = await h.factory.term.create({
      taxonomy: "category",
      name: "X",
      slug: "x",
    });
    await expect(h.client.term.delete({ id: row.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:delete" },
    });
  });

  test("404 when the term does not exist", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    await expect(h.client.term.delete({ id: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
