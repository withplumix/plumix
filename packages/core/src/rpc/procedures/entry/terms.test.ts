import { describe, expect, test } from "vitest";

import type { UserRole } from "../../../db/schema/users.js";
import { and, asc, eq } from "../../../db/index.js";
import { entryTerm } from "../../../db/schema/entry_term.js";
import { terms } from "../../../db/schema/terms.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

function taxonomyRegistry(
  opts: {
    readonly assignRole?: UserRole;
    readonly termTaxonomies?: readonly string[];
  } = {},
) {
  const registry = createPluginRegistry();
  for (const name of opts.termTaxonomies ?? ["category", "post_tag"]) {
    registry.termTaxonomies.set(name, {
      name,
      label: name,
      registeredBy: "test",
    });
    registry.capabilities.set(`term:${name}:read`, {
      name: `term:${name}:read`,
      minRole: "subscriber",
      registeredBy: "test",
    });
    registry.capabilities.set(`term:${name}:assign`, {
      name: `term:${name}:assign`,
      minRole: opts.assignRole ?? "contributor",
      registeredBy: "test",
    });
    registry.capabilities.set(`term:${name}:edit`, {
      name: `term:${name}:edit`,
      minRole: "editor",
      registeredBy: "test",
    });
  }
  return registry;
}

async function seedTerm(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  termTaxonomy: string,
  slug: string,
): Promise<number> {
  const [row] = await h.context.db
    .insert(terms)
    .values({ taxonomy: termTaxonomy, name: slug, slug })
    .returning();
  if (!row) throw new Error("seedTerm: insert returned no row");
  return row.id;
}

async function readTermIds(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  entryId: number,
  termTaxonomy: string,
): Promise<number[]> {
  const rows = await h.context.db
    .select({ termId: entryTerm.termId })
    .from(entryTerm)
    .innerJoin(terms, eq(entryTerm.termId, terms.id))
    .where(
      and(eq(entryTerm.entryId, entryId), eq(terms.taxonomy, termTaxonomy)),
    )
    .orderBy(asc(entryTerm.sortOrder));
  return rows.map((r) => r.termId);
}

describe("entry.update — terms", () => {
  test("author attaches categories to their own post", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "author", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const catA = await seedTerm(h, "category", "news");
    const catB = await seedTerm(h, "category", "reviews");

    await h.client.entry.update({
      id: post.id,
      terms: { category: [catA, catB] },
    });

    expect(await readTermIds(h, post.id, "category")).toEqual([catA, catB]);
  });

  test("replacement semantics — new list overwrites the old one entirely", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const a = await seedTerm(h, "category", "a");
    const b = await seedTerm(h, "category", "b");
    const c = await seedTerm(h, "category", "c");

    await h.client.entry.update({ id: post.id, terms: { category: [a, b] } });
    await h.client.entry.update({ id: post.id, terms: { category: [c] } });

    expect(await readTermIds(h, post.id, "category")).toEqual([c]);
  });

  test("empty array clears assignments for that termTaxonomy", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const a = await seedTerm(h, "category", "a");

    await h.client.entry.update({ id: post.id, terms: { category: [a] } });
    await h.client.entry.update({ id: post.id, terms: { category: [] } });

    expect(await readTermIds(h, post.id, "category")).toEqual([]);
  });

  test("omitted termTaxonomy is untouched", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const cat = await seedTerm(h, "category", "cat-1");
    const tag = await seedTerm(h, "post_tag", "tag-1");

    await h.client.entry.update({
      id: post.id,
      terms: { category: [cat], post_tag: [tag] },
    });
    // Only update category — post_tag must stay put.
    await h.client.entry.update({
      id: post.id,
      terms: { category: [] },
    });

    expect(await readTermIds(h, post.id, "category")).toEqual([]);
    expect(await readTermIds(h, post.id, "post_tag")).toEqual([tag]);
  });

  test("duplicate ids in the input are deduped", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const a = await seedTerm(h, "category", "a");

    await h.client.entry.update({
      id: post.id,
      terms: { category: [a, a, a] },
    });
    expect(await readTermIds(h, post.id, "category")).toEqual([a]);
  });

  test("unregistered termTaxonomy → NOT_FOUND (no partial writes)", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const cat = await seedTerm(h, "category", "cat");

    await expect(
      h.client.entry.update({
        id: post.id,
        terms: { category: [cat], unknown_tax: [1] },
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "termTaxonomy", id: "unknown_tax" },
    });
    // Partial-write guard: the first termTaxonomy wasn't applied because the
    // second one failed capability/registration validation up front.
    expect(await readTermIds(h, post.id, "category")).toEqual([]);
  });

  test("missing {termTaxonomy}:assign cap → FORBIDDEN (even for editor if cap elevated)", async () => {
    const plugins = taxonomyRegistry({ assignRole: "admin" });
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const cat = await seedTerm(h, "category", "cat");

    await expect(
      h.client.entry.update({ id: post.id, terms: { category: [cat] } }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:assign" },
    });
  });

  test("term from a different termTaxonomy → CONFLICT term_taxonomy_mismatch", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const tag = await seedTerm(h, "post_tag", "misplaced");

    await expect(
      h.client.entry.update({
        id: post.id,
        terms: { category: [tag] },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "term_taxonomy_mismatch" },
    });
  });

  test("non-existent term id → CONFLICT term_taxonomy_mismatch", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });

    await expect(
      h.client.entry.update({
        id: post.id,
        terms: { category: [99999] },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "term_taxonomy_mismatch" },
    });
  });

  test("terms-only update (no other fields) still applies assignments", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const originalTitle = post.title;
    const cat = await seedTerm(h, "category", "only-terms");

    const updated = await h.client.entry.update({
      id: post.id,
      terms: { category: [cat] },
    });
    expect(updated.title).toBe(originalTitle);
    expect(await readTermIds(h, post.id, "category")).toEqual([cat]);
  });

  test("sortOrder mirrors input array order", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const a = await seedTerm(h, "category", "a");
    const b = await seedTerm(h, "category", "b");
    const c = await seedTerm(h, "category", "c");

    await h.client.entry.update({
      id: post.id,
      terms: { category: [c, a, b] },
    });
    expect(await readTermIds(h, post.id, "category")).toEqual([c, a, b]);
  });

  test("empty terms object is a no-op", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    await expect(
      h.client.entry.update({ id: post.id, terms: {} }),
    ).resolves.toBeDefined();
  });

  test("re-inserting the same term id is idempotent (guards PK race)", async () => {
    // Simulates the outcome of concurrent updates that both want the same
    // final assignment — the second insert hits the (entryId, termId) PK
    // that the first insert just created. onConflictDoNothing keeps us
    // from bubbling a 500 in that race.
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const post = await h.factory.draft.create({ authorId: h.user.id });
    const cat = await seedTerm(h, "category", "stable");

    await h.client.entry.update({ id: post.id, terms: { category: [cat] } });
    // Second call with the same set — without onConflictDoNothing the
    // delete-then-insert pattern would still work, but a future migration
    // to batched writes could regress. This guards the invariant directly.
    const second = await h.client.entry.update({
      id: post.id,
      terms: { category: [cat] },
    });
    expect(second).toBeDefined();
    expect(await readTermIds(h, post.id, "category")).toEqual([cat]);
  });
});
