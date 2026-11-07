import { describe, expect, test } from "vitest";

import { testSite } from "../../../test/site.js";
import { userLookupAdapter } from "./lookup.js";

const site = await testSite({
  plugins: [],
  config: { roles: { designer: { can: { admin: ["access"] } } } },
});

/**
 * Existence checks ride the `list({ ids })` batch path — same scope rules,
 * single query: an id in the result ⇔ the user exists.
 */
describe("userLookupAdapter", () => {
  test("list({ ids }) returns a row for an active user", async () => {
    const user = await site.factory.user.create();

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(user.id)],
      limit: 1,
    });

    expect(rows.map((row) => row.id)).toEqual([String(user.id)]);
  });

  test("list({ ids }) returns nothing for a non-existent id", async () => {
    const rows = await userLookupAdapter.list(site.context, {
      ids: ["999999"],
      limit: 1,
    });

    expect(rows).toEqual([]);
  });

  test.each(["", "abc", "0", "-1", "1.5"])(
    "list({ ids }) drops the malformed id %j before querying",
    async (id) => {
      await site.factory.user.create();

      const rows = await userLookupAdapter.list(site.context, {
        ids: [id],
        limit: 1,
      });

      expect(rows).toEqual([]);
    },
  );

  test("list({ ids }) leaves out a user outside the scope's roles", async () => {
    const author = await site.factory.author.create();

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(author.id)],
      scope: { roles: ["editor", "admin"] },
      limit: 1,
    });

    expect(rows).toEqual([]);
  });

  test("list({ ids }) keeps a user inside the scope's roles", async () => {
    const author = await site.factory.author.create();

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(author.id)],
      scope: { roles: ["author"] },
      limit: 1,
    });

    expect(rows.map((row) => row.id)).toEqual([String(author.id)]);
  });

  test("list({ ids }) scopes to a role the config declares", async () => {
    const designer = await site.factory.user.create({ role: "designer" });

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(designer.id)],
      scope: { roles: ["designer"] },
      limit: 1,
    });

    expect(rows.map((row) => row.id)).toEqual([String(designer.id)]);
  });

  test("list({ ids }) leaves out a disabled user by default", async () => {
    const user = await site.factory.user.create({
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(user.id)],
      limit: 1,
    });

    expect(rows).toEqual([]);
  });

  test("list({ ids }) keeps a disabled user when the scope includes them", async () => {
    const user = await site.factory.user.create({
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(user.id)],
      scope: { includeDisabled: true },
      limit: 1,
    });

    expect(rows.map((row) => row.id)).toEqual([String(user.id)]);
  });

  test("list({ ids }) returns multiple rows in one query (batch path)", async () => {
    const a = await site.factory.user.create({ name: "Ann" });
    const b = await site.factory.user.create({ name: "Bea" });

    const rows = await userLookupAdapter.list(site.context, {
      ids: [String(a.id), String(b.id), "999999"],
      limit: 3,
    });

    expect(rows.map((row) => row.id)).toEqual([String(a.id), String(b.id)]);
  });

  test("list({ ids: [] }) short-circuits without querying", async () => {
    const rows = await userLookupAdapter.list(site.context, {
      ids: [],
      limit: 1,
    });

    expect(rows).toEqual([]);
  });

  test("list() searches by email and name (case-insensitive substring)", async () => {
    await site.factory.user.create({
      email: "alice@example.test",
      name: "Alice",
    });
    await site.factory.user.create({ email: "bob@example.test", name: "Bob" });

    const rows = await userLookupAdapter.list(site.context, {
      query: "alice",
    });

    expect(rows.map((row) => row.label)).toEqual(["Alice"]);
  });

  test("list() returns no more rows than the limit", async () => {
    await site.factory.user.createList(5);

    const rows = await userLookupAdapter.list(site.context, { limit: 2 });

    expect(rows).toHaveLength(2);
  });

  test("list() reads a zero limit as the default of 20", async () => {
    await site.factory.user.createList(21);

    const rows = await userLookupAdapter.list(site.context, { limit: 0 });

    expect(rows).toHaveLength(20);
  });

  test("list() returns subtitle that includes role for users with names", async () => {
    await site.factory.admin.create({ name: "Ada" });

    const rows = await userLookupAdapter.list(site.context, { query: "Ada" });

    expect(rows.map((row) => row.label)).toEqual(["Ada"]);
    expect(rows[0]?.subtitle).toContain("admin");
  });

  test("hydrate() resolves ids into public-safe user summaries", async () => {
    const user = await site.factory.user.create({ name: "Eva" });

    const rows = await userLookupAdapter.hydrate(site.context, {
      ids: [String(user.id)],
    });

    // Exact-object equality doubles as a leak pin: hydrated user
    // summaries flow into public render + REST, so email/role must
    // never appear.
    expect(rows).toEqual([
      { id: String(user.id), name: "Eva", slug: user.slug, avatarUrl: null },
    ]);
  });

  test("hydrate() omits missing and out-of-scope ids", async () => {
    const author = await site.factory.author.create();

    const rows = await userLookupAdapter.hydrate(site.context, {
      ids: [String(author.id), "999999", "abc"],
      scope: { roles: ["admin"] },
    });

    expect(rows).toEqual([]);
  });
});
