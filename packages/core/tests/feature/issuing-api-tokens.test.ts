import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { apiTokens } from "../../src/db/schema/api_tokens.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

/** Calls a procedure over the wire, signed in by an API token's secret alone. */
function callWithToken(secret: string, procedure: string, input: unknown) {
  return site.visit(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: input }),
  });
}

describe("a visitor", () => {
  test("is refused listing API tokens", async () => {
    const listing = site.rpc.auth.apiTokens.list({});

    await expect(listing).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("is refused creating an API token", async () => {
    const creating = site.rpc.auth.apiTokens.create({ name: "x" });

    await expect(creating).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("is refused revoking an API token", async () => {
    const revoking = site.rpc.auth.apiTokens.revoke({ id: "x" });

    await expect(revoking).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("creating an API token", () => {
  test("returns its secret once, and listing never shows it", async () => {
    const editor = site.actingAs("editor");

    const created = await editor.rpc.auth.apiTokens.create({
      name: "ci-bot",
      expiresInDays: 30,
    });

    expect(created.secret).toMatch(/^pl_pat_/);
    expect(created.token.prefix).toMatch(/^pl_pat_/);
    expect(created.token.id).not.toBe(created.secret);
    const listed = await editor.rpc.auth.apiTokens.list({});
    expect(listed).toMatchObject([{ id: created.token.id, name: "ci-bot" }]);
    expect(JSON.stringify(listed[0])).not.toContain(created.secret);
  });

  test("with no expiry stores a token that never expires", async () => {
    const created = await site
      .actingAs("editor")
      .rpc.auth.apiTokens.create({ name: "long-lived", expiresInDays: null });

    expect(created.token.expiresAt).toBeNull();
  });

  test("stores its scopes, and listing shows them", async () => {
    const editor = site.actingAs("editor");

    const created = await editor.rpc.auth.apiTokens.create({
      name: "scoped",
      scopes: ["entry:post:read", "settings:manage"],
    });

    expect(created.token.scopes).toEqual([
      "entry:post:read",
      "settings:manage",
    ]);
    const listed = await editor.rpc.auth.apiTokens.list({});
    expect(listed[0]?.scopes).toEqual(["entry:post:read", "settings:manage"]);
  });

  test("refuses a malformed scope", async () => {
    const creating = site.actingAs("editor").rpc.auth.apiTokens.create({
      name: "bogus",
      scopes: ["bad scope"],
    });

    await expect(creating).rejects.toBeDefined();
  });

  test("with no scopes is unrestricted, inheriting the role's capabilities", async () => {
    const created = await site
      .actingAs("editor")
      .rpc.auth.apiTokens.create({ name: "unrestricted", scopes: null });

    expect(created.token.scopes).toBeNull();
  });
});

describe("listing API tokens", () => {
  test("shows only the caller's own", async () => {
    const other = await site.factory.user.create();
    await site.factory.apiToken.create({
      userId: other.id,
      name: "other-user-token",
    });
    const editor = site.actingAs("editor");
    await editor.rpc.auth.apiTokens.create({ name: "mine" });

    const listed = await editor.rpc.auth.apiTokens.list({});

    expect(listed.map((token) => token.name)).toEqual(["mine"]);
  });
});

describe("revoking an API token", () => {
  test("soft-deletes the caller's own token", async () => {
    const editor = site.actingAs("editor");
    const created = await editor.rpc.auth.apiTokens.create({ name: "t" });

    const result = await editor.rpc.auth.apiTokens.revoke({
      id: created.token.id,
    });

    expect(result).toEqual({ id: created.token.id });
    await expect(editor.rpc.auth.apiTokens.list({})).resolves.toEqual([]);
    // The row stays, with revokedAt set, ready for an audit log.
    const stored = await site.context.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, created.token.id))
      .get();
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });

  test("answers NOT_FOUND for another user's token, so it is no oracle", async () => {
    const other = await site.factory.user.create();
    const theirs = await site.factory.apiToken.create({
      userId: other.id,
      name: "their-token",
    });

    const revoking = site
      .actingAs("editor")
      .rpc.auth.apiTokens.revoke({ id: theirs.row.id });

    await expect(revoking).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("a caller signed in with an API token", () => {
  test("lists its tokens", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      name: "scoped",
      scopes: ["entry:post:read"],
    });

    const page = await callWithToken(secret, "auth/apiTokens/list", {});

    page.assertOk().assertJson({ json: [{ name: "scoped" }] });
  });

  test("is refused minting a token, so a scoped token can't mint a wider one", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      name: "scoped",
      scopes: ["entry:post:read"],
    });

    const page = await callWithToken(secret, "auth/apiTokens/create", {
      name: "wider",
      scopes: null,
    });

    page.assertJson({ json: { code: "UNAUTHORIZED" } });
    expect(await site.context.db.select().from(apiTokens)).toHaveLength(1);
  });

  test("is refused approving a device code", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      name: "scoped",
      scopes: ["entry:post:read"],
    });
    const { userCode } = await site.factory.deviceCode.create();

    const page = await callWithToken(secret, "auth/deviceFlow/approve", {
      userCode,
      tokenName: "cli",
    });

    page.assertJson({ json: { code: "UNAUTHORIZED" } });
    await expect(
      site.actingAs(editor).rpc.auth.deviceFlow.lookup({ userCode }),
    ).resolves.toEqual({ ok: true });
  });
});
