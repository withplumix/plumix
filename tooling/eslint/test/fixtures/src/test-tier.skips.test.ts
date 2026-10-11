import { describe, expect, it, test } from "vitest";

test.skip("waits on a fix nobody filed", () => {
  expect(1).toBe(1);
});

it.skip("waits on the cache fix (#1234)", () => {
  expect(1).toBe(1);
});

describe.fixme("a suite with no reason", () => {
  test("reads nothing", () => {
    expect(1).toBe(1);
  });
});

test.skipIf(process.platform === "win32")("needs /dev/fd", () => {
  expect(1).toBe(1);
});

const reason = "the slot has no TTL";
test.skip(`expires a key — ${reason}`, () => undefined);
