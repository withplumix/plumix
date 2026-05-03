import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { apiTokens } from "../db/schema/api_tokens.js";
import { deviceCodes } from "../db/schema/device_codes.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { API_TOKEN_PREFIX } from "./api-tokens.js";
import {
  approveDeviceCode,
  denyDeviceCode,
  DEVICE_FLOW_INTERVAL_SECONDS,
  DEVICE_FLOW_TTL_SECONDS,
  exchangeDeviceCode,
  lookupDeviceCodeByUserCode,
  requestDeviceCode,
} from "./device-flow.js";

describe("requestDeviceCode", () => {
  test("returns a device_code, user_code, and the spec defaults", async () => {
    const db = await createTestDb();
    const result = await requestDeviceCode(db);

    expect(result.deviceCode.length).toBeGreaterThan(20);
    expect(result.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.expiresIn).toBe(DEVICE_FLOW_TTL_SECONDS);
    expect(result.interval).toBe(DEVICE_FLOW_INTERVAL_SECONDS);
  });

  test("user codes use the unambiguous alphabet (no 0/O/1/I)", async () => {
    const db = await createTestDb();
    for (let i = 0; i < 30; i += 1) {
      const { userCode } = await requestDeviceCode(db);
      expect(userCode).not.toMatch(/[01OI]/);
    }
  });

  test("persists a pending device_codes row with no userId", async () => {
    const db = await createTestDb();
    await requestDeviceCode(db);

    const rows = await db.select().from(deviceCodes);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.status).toBe("pending");
  });
});

describe("lookupDeviceCodeByUserCode", () => {
  test("returns ok for a pending user_code", async () => {
    const db = await createTestDb();
    const { userCode } = await requestDeviceCode(db);

    const result = await lookupDeviceCodeByUserCode(db, userCode);
    expect(result.outcome).toBe("ok");
  });

  test("returns not_found for an unknown user_code", async () => {
    const db = await createTestDb();
    await requestDeviceCode(db);

    const result = await lookupDeviceCodeByUserCode(db, "ZZZZ-ZZZZ");
    expect(result.outcome).toBe("not_found");
  });

  test("returns expired for a row whose TTL has passed", async () => {
    const db = await createTestDb();
    const { userCode } = await requestDeviceCode(db);
    await db
      .update(deviceCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const result = await lookupDeviceCodeByUserCode(db, userCode);
    expect(result.outcome).toBe("expired");
  });

  test("returns already_approved once the row has been approved", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { userCode } = await requestDeviceCode(db);
    const lookup = await lookupDeviceCodeByUserCode(db, userCode);
    if (lookup.outcome !== "ok") throw new Error("expected ok");

    await approveDeviceCode(db, {
      id: lookup.id,
      userId: user.id,
      tokenName: "cli",
    });

    const second = await lookupDeviceCodeByUserCode(db, userCode);
    expect(second.outcome).toBe("already_approved");
  });

  test("returns already_denied once the row has been denied", async () => {
    const db = await createTestDb();
    const { userCode } = await requestDeviceCode(db);
    const lookup = await lookupDeviceCodeByUserCode(db, userCode);
    if (lookup.outcome !== "ok") throw new Error("expected ok");

    await denyDeviceCode(db, { id: lookup.id });

    const second = await lookupDeviceCodeByUserCode(db, userCode);
    expect(second.outcome).toBe("already_denied");
  });
});

describe("approveDeviceCode", () => {
  test("persists scopes onto the device_codes row", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { userCode } = await requestDeviceCode(db);
    const lookup = await lookupDeviceCodeByUserCode(db, userCode);
    if (lookup.outcome !== "ok") throw new Error("expected ok");

    await approveDeviceCode(db, {
      id: lookup.id,
      userId: user.id,
      tokenName: "cli",
      scopes: ["entry:post:read", "settings:manage"],
    });

    const row = await db
      .select()
      .from(deviceCodes)
      .where(eq(deviceCodes.id, lookup.id))
      .get();
    expect(row?.scopes).toEqual(["entry:post:read", "settings:manage"]);
  });
});

describe("exchangeDeviceCode", () => {
  test("returns pending until the row is approved", async () => {
    const db = await createTestDb();
    const { deviceCode } = await requestDeviceCode(db);

    const result = await exchangeDeviceCode(db, deviceCode, "cli");
    expect(result.outcome).toBe("pending");
  });

  test("mints a token + consumes the row on success", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { deviceCode, userCode } = await requestDeviceCode(db);
    const lookup = await lookupDeviceCodeByUserCode(db, userCode);
    if (lookup.outcome !== "ok") throw new Error("expected ok");

    await approveDeviceCode(db, {
      id: lookup.id,
      userId: user.id,
      tokenName: "cli",
    });

    const result = await exchangeDeviceCode(db, deviceCode, "fallback");
    expect(result.outcome).toBe("approved");
    if (result.outcome !== "approved") return;
    expect(result.userId).toBe(user.id);
    expect(result.secret.startsWith(API_TOKEN_PREFIX)).toBe(true);

    // Row is consumed — second exchange is invalid (delete-on-success).
    const second = await exchangeDeviceCode(db, deviceCode, "fallback");
    expect(second.outcome).toBe("invalid");
  });

  test("returns denied + consumes the row when explicitly denied", async () => {
    const db = await createTestDb();
    const { deviceCode, userCode } = await requestDeviceCode(db);
    const lookup = await lookupDeviceCodeByUserCode(db, userCode);
    if (lookup.outcome !== "ok") throw new Error("expected ok");

    await denyDeviceCode(db, { id: lookup.id });

    const result = await exchangeDeviceCode(db, deviceCode, "cli");
    expect(result.outcome).toBe("denied");

    // Consumed: subsequent exchange is invalid (no replay-discovery).
    const second = await exchangeDeviceCode(db, deviceCode, "cli");
    expect(second.outcome).toBe("invalid");
  });

  test("returns expired and reaps the row when the TTL has passed", async () => {
    const db = await createTestDb();
    const { deviceCode } = await requestDeviceCode(db);
    await db
      .update(deviceCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const result = await exchangeDeviceCode(db, deviceCode, "cli");
    expect(result.outcome).toBe("expired");

    const remaining = await db.select().from(deviceCodes);
    expect(remaining).toHaveLength(0);
  });

  test("returns invalid for an unknown device_code", async () => {
    const db = await createTestDb();
    const result = await exchangeDeviceCode(db, "totally-bogus", "cli");
    expect(result.outcome).toBe("invalid");
  });

  test("propagates approver tokenName + scopes onto the minted api_tokens row", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { deviceCode, userCode } = await requestDeviceCode(db);
    const lookup = await lookupDeviceCodeByUserCode(db, userCode);
    if (lookup.outcome !== "ok") throw new Error("expected ok");

    await approveDeviceCode(db, {
      id: lookup.id,
      userId: user.id,
      tokenName: "claude-code",
      scopes: ["entry:post:read"],
    });

    const result = await exchangeDeviceCode(db, deviceCode, "fallback");
    if (result.outcome !== "approved") throw new Error("expected approved");

    const rows = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("claude-code");
    expect(rows[0]?.scopes).toEqual(["entry:post:read"]);
  });
});
