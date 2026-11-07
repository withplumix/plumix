import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { apiTokens } from "../../src/db/schema/api_tokens.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("listing every user's API tokens", () => {
  test("is refused to a caller without user:manage_tokens", async () => {
    const listing = site.actingAs("editor").rpc.auth.apiTokens.adminList({});

    await expect(listing).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:manage_tokens" },
    });
  });

  test("returns the tokens of every user, with their owners", async () => {
    const a = await site.factory.user.create({ email: "a@example.test" });
    const b = await site.factory.user.create({ email: "b@example.test" });
    await site.factory.apiToken.create({ userId: a.id, name: "a-1" });
    await site.factory.apiToken.create({ userId: b.id, name: "b-1" });
    await site.factory.apiToken.create({ userId: b.id, name: "b-2" });

    const all = await site.actingAs("admin").rpc.auth.apiTokens.adminList({});

    expect(all.total).toBe(3);
    expect(new Set(all.items.map((row) => row.name))).toEqual(
      new Set(["a-1", "b-1", "b-2"]),
    );
    expect(new Set(all.items.map((row) => row.user.email))).toEqual(
      new Set(["a@example.test", "b@example.test"]),
    );
  });

  test("narrows to one user's tokens", async () => {
    const a = await site.factory.user.create();
    const b = await site.factory.user.create();
    await site.factory.apiToken.create({ userId: a.id, name: "a-1" });
    await site.factory.apiToken.create({ userId: b.id, name: "b-1" });

    const filtered = await site
      .actingAs("admin")
      .rpc.auth.apiTokens.adminList({ userId: a.id });

    expect(filtered.total).toBe(1);
    expect(filtered.items.map((row) => row.name)).toEqual(["a-1"]);
  });

  test("leaves out revoked tokens by default", async () => {
    const target = await site.factory.user.create();
    const active = await site.factory.apiToken.create({
      userId: target.id,
      name: "active",
    });
    const revoked = await site.factory.apiToken.create({
      userId: target.id,
      name: "revoked",
    });
    const admin = site.actingAs("admin");
    await admin.rpc.auth.apiTokens.adminRevoke({ id: revoked.row.id });

    const listed = await admin.rpc.auth.apiTokens.adminList({
      userId: target.id,
    });

    expect(listed.total).toBe(1);
    expect(listed.items.map((row) => row.id)).toEqual([active.row.id]);
  });

  test("includes revoked tokens when asked to", async () => {
    const target = await site.factory.user.create();
    await site.factory.apiToken.create({ userId: target.id, name: "active" });
    const revoked = await site.factory.apiToken.create({
      userId: target.id,
      name: "revoked",
    });
    const admin = site.actingAs("admin");
    await admin.rpc.auth.apiTokens.adminRevoke({ id: revoked.row.id });

    const auditView = await admin.rpc.auth.apiTokens.adminList({
      userId: target.id,
      includeRevoked: true,
    });

    expect(auditView.total).toBe(2);
  });

  test("pages by limit and offset", async () => {
    const target = await site.factory.user.create();
    await site.factory.apiToken.create({ userId: target.id, name: "t-0" });
    await site.factory.apiToken.create({ userId: target.id, name: "t-1" });
    await site.factory.apiToken.create({ userId: target.id, name: "t-2" });
    await site.factory.apiToken.create({ userId: target.id, name: "t-3" });
    await site.factory.apiToken.create({ userId: target.id, name: "t-4" });
    const admin = site.actingAs("admin");
    const first = await admin.rpc.auth.apiTokens.adminList({
      userId: target.id,
      limit: 2,
      offset: 0,
    });

    const second = await admin.rpc.auth.apiTokens.adminList({
      userId: target.id,
      limit: 2,
      offset: 2,
    });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(first.total).toBe(5);
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
  });
});

describe("revoking any user's API token", () => {
  test("soft-deletes the token", async () => {
    const target = await site.factory.user.create();
    const leaked = await site.factory.apiToken.create({
      userId: target.id,
      name: "leaked",
    });

    const result = await site
      .actingAs("admin")
      .rpc.auth.apiTokens.adminRevoke({ id: leaked.row.id });

    expect(result).toEqual({ id: leaked.row.id });
    const stored = await site.context.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, leaked.row.id))
      .get();
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });

  test("is refused to a caller without user:manage_tokens", async () => {
    const target = await site.factory.user.create();
    const token = await site.factory.apiToken.create({
      userId: target.id,
      name: "x",
    });

    const revoking = site
      .actingAs("editor")
      .rpc.auth.apiTokens.adminRevoke({ id: token.row.id });

    await expect(revoking).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:manage_tokens" },
    });
  });

  test("answers NOT_FOUND for a token already revoked", async () => {
    const target = await site.factory.user.create();
    const token = await site.factory.apiToken.create({
      userId: target.id,
      name: "x",
    });
    const admin = site.actingAs("admin");
    await admin.rpc.auth.apiTokens.adminRevoke({ id: token.row.id });

    const revoking = admin.rpc.auth.apiTokens.adminRevoke({ id: token.row.id });

    await expect(revoking).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("answers NOT_FOUND for an unknown id", async () => {
    const revoking = site
      .actingAs("admin")
      .rpc.auth.apiTokens.adminRevoke({ id: "ghost-id" });

    await expect(revoking).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
