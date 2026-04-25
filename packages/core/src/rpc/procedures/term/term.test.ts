import { describe, expect, test } from "vitest";

import type { UserRole } from "../../../db/schema/users.js";
import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

function first<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("expected at least one row from the db");
  return row;
}

// "category" is the canonical hierarchical taxonomy in WP; used here as the
// fixture because term RPC requires a registered taxonomy to operate.
function taxonomyRegistry() {
  const registry = createPluginRegistry();
  registry.termTaxonomies.set("category", {
    name: "category",
    label: "Categories",
    isHierarchical: true,
    registeredBy: "test",
  });
  const caps: Record<string, UserRole> = {
    "term:category:read": "subscriber",
    "term:category:assign": "contributor",
    "term:category:edit": "editor",
    "term:category:delete": "editor",
  };
  for (const [name, minRole] of Object.entries(caps)) {
    registry.capabilities.set(name, { name, minRole, registeredBy: "test" });
  }
  return registry;
}

describe("term.list", () => {
  test("returns terms in the requested taxonomy", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    await h.context.db.insert(terms).values([
      { taxonomy: "category", name: "Alpha", slug: "alpha" },
      { taxonomy: "category", name: "Beta", slug: "beta" },
    ]);

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
    const root = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "Root", slug: "root" })
        .returning(),
    );
    await h.context.db.insert(terms).values({
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
    const row = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "Got", slug: "got" })
        .returning(),
    );

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
    plugins.termTaxonomies.set("post_tag", {
      name: "post_tag",
      label: "Tags",
      registeredBy: "test",
    });
    plugins.capabilities.set("term:post_tag:edit", {
      name: "term:post_tag:edit",
      minRole: "editor",
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const otherTaxRow = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "post_tag", name: "Tag", slug: "tag-1" })
        .returning(),
    );
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
    const row = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "Old", slug: "old" })
        .returning(),
    );
    const updated = await h.client.term.update({
      id: row.id,
      name: "New Name",
    });
    expect(updated.name).toBe("New Name");
  });

  test("subscriber cannot update", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    const row = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "Name", slug: "name" })
        .returning(),
    );
    await expect(
      h.client.term.update({ id: row.id, name: "Hax" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("setting parent = self → CONFLICT (parent_is_self)", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const row = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "Self", slug: "self" })
        .returning(),
    );
    await expect(
      h.client.term.update({ id: row.id, parentId: row.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_is_self" },
    });
  });

  test("cycle detection rejects setting parent to a descendant", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    // A -> B -> C (B's parent is A; C's parent is B).
    const a = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "A", slug: "a" })
        .returning(),
    );
    const b = first(
      await h.context.db
        .insert(terms)
        .values({
          taxonomy: "category",
          name: "B",
          slug: "b",
          parentId: a.id,
        })
        .returning(),
    );
    const c = first(
      await h.context.db
        .insert(terms)
        .values({
          taxonomy: "category",
          name: "C",
          slug: "c",
          parentId: b.id,
        })
        .returning(),
    );
    // Attempting A.parent = C would form a cycle A -> C -> B -> A.
    await expect(
      h.client.term.update({ id: a.id, parentId: c.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "parent_cycle" },
    });
  });

  test("slug collision on update → CONFLICT", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const a = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "A", slug: "a-slug" })
        .returning(),
    );
    await h.context.db
      .insert(terms)
      .values({ taxonomy: "category", name: "B", slug: "b-slug" });
    await expect(
      h.client.term.update({ id: a.id, slug: "b-slug" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });
});

describe("term.delete", () => {
  test("editor can delete a term; children have parentId nulled", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const parent = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "P", slug: "p" })
        .returning(),
    );
    const child = first(
      await h.context.db
        .insert(terms)
        .values({
          taxonomy: "category",
          name: "C",
          slug: "c",
          parentId: parent.id,
        })
        .returning(),
    );

    await h.client.term.delete({ id: parent.id });

    const orphan = await h.context.db.query.terms.findFirst({
      where: eq(terms.id, child.id),
    });
    expect(orphan?.parentId).toBeNull();
  });

  test("author cannot delete", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "author", plugins });
    const row = first(
      await h.context.db
        .insert(terms)
        .values({ taxonomy: "category", name: "X", slug: "x" })
        .returning(),
    );
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
