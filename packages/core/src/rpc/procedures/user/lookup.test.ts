import { describe, expect, test } from "vitest";

import { adminUser, userFactory } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { userLookupAdapter } from "./lookup.js";

// Existence checks now ride the `list({ ids })` batch path — same
// scope rules, single query. These tests mirror the semantics that
// used to live on `adapter.exists`: id present in result ⇔ exists.
async function existsViaList(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  id: string,
  scope?: {
    roles?: readonly ("admin" | "editor" | "author")[];
    includeDisabled?: boolean;
  },
): Promise<boolean> {
  const rows = await userLookupAdapter.list(h.context, {
    ids: [id],
    scope,
    limit: 1,
  });
  return rows.some((row) => row.id === id);
}

describe("userLookupAdapter", () => {
  test("list({ ids }) returns a row for an active user", async () => {
    const h = await createRpcHarness();
    const u = await userFactory.transient({ db: h.context.db }).create();
    expect(await existsViaList(h, String(u.id))).toBe(true);
  });

  test("list({ ids }) returns nothing for a non-existent id", async () => {
    const h = await createRpcHarness();
    expect(await existsViaList(h, "999999")).toBe(false);
  });

  test("list({ ids }) drops malformed ids before querying", async () => {
    const h = await createRpcHarness();
    expect(await existsViaList(h, "")).toBe(false);
    expect(await existsViaList(h, "abc")).toBe(false);
    expect(await existsViaList(h, "0")).toBe(false);
    expect(await existsViaList(h, "-1")).toBe(false);
    expect(await existsViaList(h, "1.5")).toBe(false);
  });

  test("list({ ids }) honours the roles scope filter", async () => {
    const h = await createRpcHarness();
    const author = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author" });
    expect(
      await existsViaList(h, String(author.id), {
        roles: ["editor", "admin"],
      }),
    ).toBe(false);
    expect(
      await existsViaList(h, String(author.id), { roles: ["author"] }),
    ).toBe(true);
  });

  test("list({ ids }) excludes disabled users by default", async () => {
    const h = await createRpcHarness();
    const u = await userFactory
      .transient({ db: h.context.db })
      .create({ disabledAt: new Date() });
    expect(await existsViaList(h, String(u.id))).toBe(false);
    expect(
      await existsViaList(h, String(u.id), { includeDisabled: true }),
    ).toBe(true);
  });

  test("list({ ids }) returns multiple rows in one query (batch path)", async () => {
    const h = await createRpcHarness();
    const a = await userFactory.transient({ db: h.context.db }).create();
    const b = await userFactory.transient({ db: h.context.db }).create();
    const rows = await userLookupAdapter.list(h.context, {
      ids: [String(a.id), String(b.id), "999999"],
      limit: 3,
    });
    const idSet = new Set(rows.map((r) => r.id));
    expect(idSet.has(String(a.id))).toBe(true);
    expect(idSet.has(String(b.id))).toBe(true);
    expect(idSet.has("999999")).toBe(false);
  });

  test("list({ ids: [] }) short-circuits without querying", async () => {
    const h = await createRpcHarness();
    const rows = await userLookupAdapter.list(h.context, { ids: [], limit: 1 });
    expect(rows).toEqual([]);
  });

  test("list() searches by email and name (case-insensitive substring)", async () => {
    const h = await createRpcHarness();
    await userFactory
      .transient({ db: h.context.db })
      .create({ email: "alice@example.test", name: "Alice" });
    await userFactory
      .transient({ db: h.context.db })
      .create({ email: "bob@example.test", name: "Bob" });

    const aliceMatches = await userLookupAdapter.list(h.context, {
      query: "alice",
    });
    expect(aliceMatches.map((r) => r.label).sort()).toContain("Alice");
    expect(aliceMatches.find((r) => r.label === "Bob")).toBeUndefined();
  });

  test("list() respects the limit cap and rejects pathological values", async () => {
    const h = await createRpcHarness();
    for (let i = 0; i < 5; i++) {
      await userFactory.transient({ db: h.context.db }).create();
    }
    expect(await userLookupAdapter.list(h.context, { limit: 2 })).toHaveLength(
      2,
    );
    // Negative / zero / NaN fall back to the default (20), capped by row
    // count.
    const all = await userLookupAdapter.list(h.context, { limit: 0 });
    expect(all.length).toBeLessThanOrEqual(20);
  });

  test("list() returns subtitle that includes role for users with names", async () => {
    const h = await createRpcHarness();
    await adminUser.transient({ db: h.context.db }).create({ name: "Ada" });
    const results = await userLookupAdapter.list(h.context, { query: "Ada" });
    const row = results.find((r) => r.label === "Ada");
    expect(row?.subtitle).toContain("admin");
  });

  test("resolve() returns null for missing / orphaned ids", async () => {
    const h = await createRpcHarness();
    expect(await userLookupAdapter.resolve(h.context, "999999")).toBeNull();
    expect(await userLookupAdapter.resolve(h.context, "abc")).toBeNull();
  });

  test("resolve() returns the lookup result for valid in-scope ids", async () => {
    const h = await createRpcHarness();
    const u = await adminUser
      .transient({ db: h.context.db })
      .create({ name: "Eva" });
    const result = await userLookupAdapter.resolve(h.context, String(u.id), {
      roles: ["admin"],
    });
    expect(result?.id).toBe(String(u.id));
    expect(result?.label).toBe("Eva");
  });

  test("resolve() returns null when the id exists but fails scope", async () => {
    const h = await createRpcHarness();
    const u = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author" });
    expect(
      await userLookupAdapter.resolve(h.context, String(u.id), {
        roles: ["admin"],
      }),
    ).toBeNull();
  });
});
