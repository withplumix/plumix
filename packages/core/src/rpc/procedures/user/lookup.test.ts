import { describe, expect, test } from "vitest";

import { adminUser, userFactory } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { userLookupAdapter } from "./lookup.js";

describe("userLookupAdapter", () => {
  test("exists() returns true for an active user", async () => {
    const h = await createRpcHarness();
    const u = await userFactory.transient({ db: h.context.db }).create();
    expect(await userLookupAdapter.exists(h.context, String(u.id))).toBe(true);
  });

  test("exists() returns false for a non-existent id", async () => {
    const h = await createRpcHarness();
    expect(await userLookupAdapter.exists(h.context, "999999")).toBe(false);
  });

  test("exists() rejects malformed ids without hitting the DB", async () => {
    const h = await createRpcHarness();
    expect(await userLookupAdapter.exists(h.context, "")).toBe(false);
    expect(await userLookupAdapter.exists(h.context, "abc")).toBe(false);
    expect(await userLookupAdapter.exists(h.context, "0")).toBe(false);
    expect(await userLookupAdapter.exists(h.context, "-1")).toBe(false);
    expect(await userLookupAdapter.exists(h.context, "1.5")).toBe(false);
  });

  test("exists() honours the roles scope filter", async () => {
    const h = await createRpcHarness();
    const author = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author" });
    expect(
      await userLookupAdapter.exists(h.context, String(author.id), {
        roles: ["editor", "admin"],
      }),
    ).toBe(false);
    expect(
      await userLookupAdapter.exists(h.context, String(author.id), {
        roles: ["author"],
      }),
    ).toBe(true);
  });

  test("exists() excludes disabled users by default", async () => {
    const h = await createRpcHarness();
    const u = await userFactory
      .transient({ db: h.context.db })
      .create({ disabledAt: new Date() });
    expect(await userLookupAdapter.exists(h.context, String(u.id))).toBe(false);
    expect(
      await userLookupAdapter.exists(h.context, String(u.id), {
        includeDisabled: true,
      }),
    ).toBe(true);
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
