import { createTestContext, createTestDb } from "plumix/test";
import { describe, expect, test } from "vitest";

import { getOrCreateIpSalt, hashIp } from "./ip-hash.js";

describe("getOrCreateIpSalt", () => {
  test("mints one salt and returns it on every later read", async () => {
    const ctx = createTestContext({ db: await createTestDb() });

    const first = await getOrCreateIpSalt(ctx);

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(await getOrCreateIpSalt(ctx)).toBe(first);
  });

  test("mints a different salt per install", async () => {
    const one = createTestContext({ db: await createTestDb() });
    const two = createTestContext({ db: await createTestDb() });

    expect(await getOrCreateIpSalt(one)).not.toBe(await getOrCreateIpSalt(two));
  });
});

describe("hashIp", () => {
  test("is stable for one salt and different across salts", async () => {
    const hashed = await hashIp("203.0.113.7", "pepper");

    expect(hashed).toBe(await hashIp("203.0.113.7", "pepper"));
    expect(hashed).not.toBe(await hashIp("203.0.113.7", "other"));
    expect(hashed).not.toContain("203.0.113.7");
  });
});
