import { describe, expect, test } from "vitest";

import { entryFactory } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { entryLookupAdapter } from "./lookup.js";

const POST = { entryTypes: ["post"] } as const;
const PAGE = { entryTypes: ["page"] } as const;

// Existence checks now ride the `list({ ids })` batch path — same
// scope rules, single query.
async function existsViaList(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  id: string,
  scope: { entryTypes: readonly string[]; includeTrashed?: boolean },
): Promise<boolean> {
  const rows = await entryLookupAdapter.list(h.context, {
    ids: [id],
    scope,
    limit: 1,
  });
  return rows.some((row) => row.id === id);
}

describe("entryLookupAdapter", () => {
  test("list({ ids }) returns a row for an active entry under matching scope", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id });
    expect(await existsViaList(h, String(e.id), POST)).toBe(true);
  });

  test("list({ ids }) returns nothing for a non-existent id", async () => {
    const h = await createRpcHarness();
    expect(await existsViaList(h, "999999", POST)).toBe(false);
  });

  test("list({ ids }) drops malformed ids before querying", async () => {
    const h = await createRpcHarness();
    expect(await existsViaList(h, "", POST)).toBe(false);
    expect(await existsViaList(h, "abc", POST)).toBe(false);
    expect(await existsViaList(h, "0", POST)).toBe(false);
    expect(await existsViaList(h, "-1", POST)).toBe(false);
    expect(await existsViaList(h, "1.5", POST)).toBe(false);
  });

  test("list({ ids }) honours the entryTypes scope filter", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const post = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    expect(await existsViaList(h, String(post.id), PAGE)).toBe(false);
    expect(await existsViaList(h, String(post.id), POST)).toBe(true);
  });

  test("list({ ids }) excludes trashed entries by default", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const trashed = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, status: "trash" });
    expect(await existsViaList(h, String(trashed.id), POST)).toBe(false);
    expect(
      await existsViaList(h, String(trashed.id), {
        ...POST,
        includeTrashed: true,
      }),
    ).toBe(true);
  });

  test("list({ ids }) batches multiple ids in one query", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const a = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id });
    const b = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id });
    const rows = await entryLookupAdapter.list(h.context, {
      ids: [String(a.id), String(b.id), "999999"],
      scope: POST,
      limit: 3,
    });
    const idSet = new Set(rows.map((r) => r.id));
    expect(idSet.has(String(a.id))).toBe(true);
    expect(idSet.has(String(b.id))).toBe(true);
    expect(idSet.has("999999")).toBe(false);
  });

  test("rejects calls without scope (would otherwise expose every type)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(entryLookupAdapter.list(h.context, {})).rejects.toThrow(
      /entryTypes is required/,
    );
    await expect(
      entryLookupAdapter.list(h.context, { ids: ["1"] }),
    ).rejects.toThrow(/entryTypes is required/);
    await expect(entryLookupAdapter.resolve(h.context, "1")).rejects.toThrow(
      /entryTypes is required/,
    );
  });

  test("rejects calls with an empty entryTypes array (same disclosure shape)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      entryLookupAdapter.list(h.context, { scope: { entryTypes: [] } }),
    ).rejects.toThrow(/entryTypes is required/);
  });

  test("list() searches by title (case-insensitive substring)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Alpha Release" });
    await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Beta Notes" });

    const matches = await entryLookupAdapter.list(h.context, {
      query: "alpha",
      scope: POST,
    });
    expect(matches.find((r) => r.label === "Alpha Release")).toBeDefined();
    expect(matches.find((r) => r.label === "Beta Notes")).toBeUndefined();
  });

  test("list() respects the limit cap and clamps pathological values", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    for (let i = 0; i < 5; i++) {
      await entryFactory
        .transient({ db: h.context.db })
        .create({ authorId: h.user.id });
    }
    expect(
      await entryLookupAdapter.list(h.context, { limit: 2, scope: POST }),
    ).toHaveLength(2);
    const all = await entryLookupAdapter.list(h.context, {
      limit: 0,
      scope: POST,
    });
    expect(all.length).toBeLessThanOrEqual(20);
  });

  test("list() returns subtitle including type + status", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Released", status: "published" });
    const results = await entryLookupAdapter.list(h.context, {
      query: "Released",
      scope: POST,
    });
    const row = results.find((r) => r.label === "Released");
    expect(row?.subtitle).toContain("post");
    expect(row?.subtitle).toContain("published");
  });

  test("resolve() returns null for missing / orphaned ids", async () => {
    const h = await createRpcHarness();
    expect(
      await entryLookupAdapter.resolve(h.context, "999999", POST),
    ).toBeNull();
    expect(await entryLookupAdapter.resolve(h.context, "abc", POST)).toBeNull();
  });

  test("resolve() returns the lookup result for valid in-scope ids", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Specific" });
    const result = await entryLookupAdapter.resolve(
      h.context,
      String(e.id),
      POST,
    );
    expect(result?.id).toBe(String(e.id));
    expect(result?.label).toBe("Specific");
  });

  test("resolve() returns null when the id exists but fails scope", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    expect(
      await entryLookupAdapter.resolve(h.context, String(e.id), PAGE),
    ).toBeNull();
  });

  test("falls back to 'Untitled <type>' label when title is empty", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "   " });
    const result = await entryLookupAdapter.resolve(
      h.context,
      String(e.id),
      POST,
    );
    expect(result?.label).toBe("Untitled post");
  });
});
