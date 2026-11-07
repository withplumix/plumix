import { describe, expect, test } from "vitest";

import { exchangeDeviceCode } from "../../src/auth/device-flow.js";
import { eq } from "../../src/db/index.js";
import { apiTokens } from "../../src/db/schema/api_tokens.js";
import { deviceCodes } from "../../src/db/schema/device_codes.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("a visitor", () => {
  test("is refused looking up a device code", async () => {
    const looking = site.rpc.auth.deviceFlow.lookup({ userCode: "AAAA-AAAA" });

    await expect(looking).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("is refused approving a device code", async () => {
    const approving = site.rpc.auth.deviceFlow.approve({
      userCode: "AAAA-AAAA",
      tokenName: "x",
    });

    await expect(approving).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("is refused denying a device code", async () => {
    const denying = site.rpc.auth.deviceFlow.deny({ userCode: "AAAA-AAAA" });

    await expect(denying).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("looking up a device code", () => {
  test("finds a pending code", async () => {
    const { userCode } = await site.factory.deviceCode.create();

    const result = await site
      .actingAs("editor")
      .rpc.auth.deviceFlow.lookup({ userCode });

    expect(result).toEqual({ ok: true });
  });

  test("accepts the code typed lowercase without its dash", async () => {
    await site.factory.deviceCode.create({ userCode: "ABCD-EFGH" });

    const result = await site
      .actingAs("editor")
      .rpc.auth.deviceFlow.lookup({ userCode: "abcdefgh" });

    expect(result).toEqual({ ok: true });
  });

  test("answers NOT_FOUND for an unknown code", async () => {
    const looking = site
      .actingAs("editor")
      .rpc.auth.deviceFlow.lookup({ userCode: "ZZZZ-ZZZZ" });

    await expect(looking).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "device_code" },
    });
  });

  test("answers CONFLICT once the code is approved", async () => {
    const { userCode } = await site.factory.deviceCode.create();
    const editor = site.actingAs("editor");
    await editor.rpc.auth.deviceFlow.approve({ userCode, tokenName: "cli" });

    const looking = editor.rpc.auth.deviceFlow.lookup({ userCode });

    await expect(looking).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });

  test("answers CONFLICT once the code is denied", async () => {
    const { userCode } = await site.factory.deviceCode.create();
    const editor = site.actingAs("editor");
    await editor.rpc.auth.deviceFlow.deny({ userCode });

    const looking = editor.rpc.auth.deviceFlow.lookup({ userCode });

    await expect(looking).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_denied" },
    });
  });
});

describe("approving a device code", () => {
  test("binds the code to the approving user", async () => {
    const editor = await site.factory.editor.create();
    const { userCode } = await site.factory.deviceCode.create();

    const result = await site
      .actingAs(editor)
      .rpc.auth.deviceFlow.approve({ userCode, tokenName: "claude-code" });

    expect(result).toEqual({ ok: true });
    const row = await site.context.db
      .select()
      .from(deviceCodes)
      .where(eq(deviceCodes.userCode, userCode))
      .get();
    expect(row).toMatchObject({
      status: "approved",
      userId: editor.id,
      tokenName: "claude-code",
    });
  });

  test("lets the device exchange its code for a token of the approver", async () => {
    const editor = await site.factory.editor.create();
    const { deviceCode, userCode } = await site.factory.deviceCode.create();

    await site
      .actingAs(editor)
      .rpc.auth.deviceFlow.approve({ userCode, tokenName: "ci" });

    const exchanged = await exchangeDeviceCode(
      site.context.db,
      deviceCode,
      "fallback",
    );
    expect(exchanged).toMatchObject({ outcome: "approved", userId: editor.id });
    expect(exchanged).toHaveProperty(
      "secret",
      expect.stringMatching(/^pl_pat_/),
    );
    const minted = await site.context.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, editor.id))
      .get();
    expect(minted?.name).toBe("ci");
  });

  test("passes its scopes through to the minted token", async () => {
    const editor = await site.factory.editor.create();
    const { deviceCode, userCode } = await site.factory.deviceCode.create();

    await site.actingAs(editor).rpc.auth.deviceFlow.approve({
      userCode,
      tokenName: "scoped-cli",
      scopes: ["entry:post:read"],
    });

    await exchangeDeviceCode(site.context.db, deviceCode, "fallback");
    const minted = await site.context.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, editor.id))
      .get();
    expect(minted?.scopes).toEqual(["entry:post:read"]);
  });

  test("refuses a blank token name", async () => {
    const { userCode } = await site.factory.deviceCode.create();

    const approving = site
      .actingAs("editor")
      .rpc.auth.deviceFlow.approve({ userCode, tokenName: "   " });

    await expect(approving).rejects.toBeDefined();
  });

  test("answers CONFLICT for a code already approved", async () => {
    const { userCode } = await site.factory.deviceCode.create();
    const editor = site.actingAs("editor");
    await editor.rpc.auth.deviceFlow.approve({ userCode, tokenName: "cli" });

    const approving = editor.rpc.auth.deviceFlow.approve({
      userCode,
      tokenName: "cli2",
    });

    await expect(approving).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });

  test("answers CONFLICT for a code already denied", async () => {
    const { userCode } = await site.factory.deviceCode.create();
    const editor = site.actingAs("editor");
    await editor.rpc.auth.deviceFlow.deny({ userCode });

    const approving = editor.rpc.auth.deviceFlow.approve({
      userCode,
      tokenName: "x",
    });

    await expect(approving).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_denied" },
    });
  });

  test("answers CONFLICT for an expired code", async () => {
    site.freezeTime("2026-06-01T12:00:00.000Z");
    const { userCode } = await site.factory.deviceCode.create({
      expiresAt: new Date("2026-06-01T11:59:59.000Z"),
    });

    const approving = site
      .actingAs("editor")
      .rpc.auth.deviceFlow.approve({ userCode, tokenName: "x" });

    await expect(approving).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "expired" },
    });
  });

  test("answers NOT_FOUND for an unknown code", async () => {
    const approving = site
      .actingAs("editor")
      .rpc.auth.deviceFlow.approve({ userCode: "ZZZZ-ZZZZ", tokenName: "cli" });

    await expect(approving).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("denying a device code", () => {
  test("denies a pending code", async () => {
    const { userCode } = await site.factory.deviceCode.create();

    const result = await site
      .actingAs("editor")
      .rpc.auth.deviceFlow.deny({ userCode });

    expect(result).toEqual({ ok: true });
  });

  test("answers CONFLICT for a code already approved", async () => {
    const { userCode } = await site.factory.deviceCode.create();
    const editor = site.actingAs("editor");
    await editor.rpc.auth.deviceFlow.approve({ userCode, tokenName: "x" });

    const denying = editor.rpc.auth.deviceFlow.deny({ userCode });

    await expect(denying).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_approved" },
    });
  });

  test("answers CONFLICT for a code already denied", async () => {
    const { userCode } = await site.factory.deviceCode.create();
    const editor = site.actingAs("editor");
    await editor.rpc.auth.deviceFlow.deny({ userCode });

    const denying = editor.rpc.auth.deviceFlow.deny({ userCode });

    await expect(denying).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_denied" },
    });
  });

  test("answers CONFLICT for an expired code", async () => {
    site.freezeTime("2026-06-01T12:00:00.000Z");
    const { userCode } = await site.factory.deviceCode.create({
      expiresAt: new Date("2026-06-01T11:59:59.000Z"),
    });

    const denying = site
      .actingAs("editor")
      .rpc.auth.deviceFlow.deny({ userCode });

    await expect(denying).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "expired" },
    });
  });
});
