import { describe, expect, test } from "vitest";

import type { UserRole } from "../../../db/schema/users.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { terms } from "../../../db/schema/terms.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

// Minimal taxonomy registry so `entry.update` accepts a `category`
// term patch — mirrors the scaffold in terms.test.ts.
function categoryRegistry() {
  const registry = createPluginRegistry();
  const name = "category";
  registry.termTaxonomies.set(name, {
    name,
    label: name,
    registeredBy: "test",
  });
  for (const [action, minRole] of [
    ["read", "subscriber"],
    ["assign", "contributor"],
    ["edit", "editor"],
  ] as const satisfies readonly [string, UserRole][]) {
    registry.capabilities.set(`term:${name}:${action}`, {
      name: `term:${name}:${action}`,
      minRole,
      registeredBy: "test",
    });
  }
  return registry;
}

describe("entry.duplicate", () => {
  test("editor duplicates an entry: a new draft row copies the content, with a fresh id and slug", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const source = await h.factory.published.create({
      authorId: h.user.id,
      title: "Original",
      slug: "original",
      excerpt: "the excerpt",
      content: { type: "doc", content: [] },
    });

    const copy = await h.client.entry.duplicate({ id: source.id });

    expect(copy.id).not.toBe(source.id);
    expect(copy.status).toBe("draft");
    expect(copy.slug).not.toBe(source.slug);
    expect(copy.excerpt).toBe("the excerpt");
    expect(copy.content).toEqual({ type: "doc", content: [] });
    // Title carries a "copy" marker so the duplicate is distinguishable
    // in the list.
    expect(copy.title).toContain("Original");

    // The copy is a real persisted row, not just an echo of the input.
    const persisted = await h.db.query.entries.findFirst({
      where: eq(entries.id, copy.id),
    });
    expect(persisted?.status).toBe("draft");
    expect(persisted?.authorId).toBe(h.user.id);
  });

  test("duplicating the same source twice yields two distinct slugs", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const source = await h.factory.published.create({
      authorId: h.user.id,
      title: "Twice",
      slug: "twice",
    });

    const first = await h.client.entry.duplicate({ id: source.id });
    const second = await h.client.entry.duplicate({ id: source.id });

    expect(first.slug).not.toBe(second.slug);
    expect(new Set([source.slug, first.slug, second.slug]).size).toBe(3);
  });

  test("copies term assignments from the source", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: categoryRegistry(),
    });
    const [category] = await h.context.db
      .insert(terms)
      .values({ taxonomy: "category", name: "news", slug: "news" })
      .returning();
    if (!category) throw new Error("seed: term insert returned no row");
    const source = await h.factory.published.create({
      authorId: h.user.id,
      title: "Tagged",
      slug: "tagged",
    });
    await h.client.entry.update({
      id: source.id,
      terms: { category: [category.id] },
    });

    const copy = await h.client.entry.duplicate({ id: source.id });

    const fetched = await h.client.entry.get({ id: copy.id });
    expect(fetched.terms.category).toEqual([category.id]);
  });

  test("copies the raw meta column from the source", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const source = await h.factory.published.create({
      authorId: h.user.id,
      title: "Has meta",
      slug: "has-meta",
      meta: { featured: true },
    });

    const copy = await h.client.entry.duplicate({ id: source.id });

    const persisted = await h.db.query.entries.findFirst({
      where: eq(entries.id, copy.id),
    });
    expect(persisted?.meta).toEqual({ featured: true });
  });

  test("a duplicate of a duplicate keeps producing fresh slugs", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const source = await h.factory.published.create({
      authorId: h.user.id,
      title: "Chain",
      slug: "chain",
    });
    const first = await h.client.entry.duplicate({ id: source.id });
    const second = await h.client.entry.duplicate({ id: first.id });
    expect(second.id).not.toBe(first.id);
    expect(second.slug).not.toBe(first.slug);
  });

  test("contributor without the type's create cap is rejected", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const source = await h.factory.published.create({
      authorId: h.user.id,
      title: "Locked",
      slug: "locked-dup",
    });
    await expect(
      h.client.entry.duplicate({ id: source.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:create" },
    });
  });

  test("404 for a missing source", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.entry.duplicate({ id: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("cannot duplicate another author's unreadable draft (404, no content leak)", async () => {
    // An author holds create + read, but a peer's *draft* isn't readable
    // to them (read of non-published needs edit_any or author+edit_own).
    // Duplicating it must 404 rather than hand back a copy of its content.
    const h = await createRpcHarness({ authAs: "author" });
    const peer = await h.factory.author.create();
    const secret = await h.factory.draft.create({
      authorId: peer.id,
      title: "Peer secret",
      slug: "peer-secret",
    });
    await expect(
      h.client.entry.duplicate({ id: secret.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("cannot duplicate a reserved-type row (revision/autosave)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const revision = await h.factory.entry.create({
      authorId: h.user.id,
      type: "revision",
      slug: "revision:1:abcdefghijklmnopqrstu",
      title: "snapshot",
    });
    await expect(
      h.client.entry.duplicate({ id: revision.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
