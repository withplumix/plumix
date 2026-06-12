import { describe, expect, test } from "vitest";

import { hashIp } from "./ip-hash.js";

describe("hashIp", () => {
  test("produces a 64-char lowercase hex digest", async () => {
    expect(await hashIp("203.0.113.5", "salt")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic for the same ip + salt", async () => {
    expect(await hashIp("203.0.113.5", "s")).toBe(
      await hashIp("203.0.113.5", "s"),
    );
  });

  test("changes with the ip", async () => {
    expect(await hashIp("203.0.113.5", "s")).not.toBe(
      await hashIp("203.0.113.6", "s"),
    );
  });

  test("changes with the salt (so the hash is not a bare sha256 of the ip)", async () => {
    expect(await hashIp("203.0.113.5", "s1")).not.toBe(
      await hashIp("203.0.113.5", "s2"),
    );
  });
});
