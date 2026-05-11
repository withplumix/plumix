import type { AppContext } from "plumix/plugin";
import { describe, expect, test, vi } from "vitest";

import type { AuditLogStorage } from "../types.js";
import { auditLog } from "../index.js";
import {
  assertValidRetention,
  computeRetentionCutoff,
  DEFAULT_RETENTION,
  runRetentionPurge,
} from "./retention.js";

interface FakeCtx {
  readonly logger: {
    debug: () => void;
    info: () => void;
    warn: ReturnType<typeof vi.fn>;
    error: () => void;
  };
}

function fakeCtx(): FakeCtx {
  return {
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: vi.fn(),
      error: () => undefined,
    },
  };
}

function fakeStorage(opts: { withPurge: boolean }): {
  storage: AuditLogStorage;
  purgeCalls: { cutoff: Date }[];
  purgeReturn: { deleted: number };
} {
  const purgeCalls: { cutoff: Date }[] = [];
  const purgeReturn = { deleted: 0 };
  const storage: AuditLogStorage = {
    kind: opts.withPurge ? "fake-with-purge" : "fake-no-purge",
    write: () => Promise.resolve(),
    query: () => Promise.resolve({ rows: [], nextCursor: null }),
    ...(opts.withPurge
      ? {
          purge: (_ctx, args) => {
            purgeCalls.push(args);
            return Promise.resolve(purgeReturn);
          },
        }
      : {}),
  };
  return { storage, purgeCalls, purgeReturn };
}

describe("computeRetentionCutoff", () => {
  test.each([
    {
      name: "90-day default — typical case",
      now: new Date("2026-05-11T00:00:00Z"),
      policy: { maxAgeDays: 90 },
      expected: new Date("2026-02-10T00:00:00Z"),
    },
    {
      name: "zero days — cutoff equals now",
      now: new Date("2026-05-11T12:34:56Z"),
      policy: { maxAgeDays: 0 },
      expected: new Date("2026-05-11T12:34:56Z"),
    },
    {
      name: "one day",
      now: new Date("2026-05-11T00:00:00Z"),
      policy: { maxAgeDays: 1 },
      expected: new Date("2026-05-10T00:00:00Z"),
    },
    {
      name: "long retention — 730 days back lands two years prior (no leap-day in the May→May window)",
      now: new Date("2026-05-11T00:00:00Z"),
      policy: { maxAgeDays: 730 },
      expected: new Date("2024-05-11T00:00:00Z"),
    },
    {
      name: "preserves sub-day precision",
      now: new Date("2026-05-11T18:45:30.500Z"),
      policy: { maxAgeDays: 7 },
      expected: new Date("2026-05-04T18:45:30.500Z"),
    },
  ])("$name", ({ now, policy, expected }) => {
    expect(computeRetentionCutoff(now, policy).toISOString()).toBe(
      expected.toISOString(),
    );
  });

  test("DEFAULT_RETENTION is 90 days", () => {
    expect(DEFAULT_RETENTION.maxAgeDays).toBe(90);
  });

  test("rejects negative maxAgeDays (would otherwise place cutoff in the future and wipe the log)", () => {
    expect(() =>
      computeRetentionCutoff(new Date("2026-05-11T00:00:00Z"), {
        maxAgeDays: -1,
      }),
    ).toThrow(/maxAgeDays must be a non-negative finite number/);
  });
});

describe("assertValidRetention", () => {
  test("retention: false is always valid", () => {
    expect(() => assertValidRetention(false)).not.toThrow();
  });

  test.each([
    { name: "zero", value: 0 },
    { name: "positive integer", value: 90 },
    { name: "large value", value: 36500 },
  ])("accepts maxAgeDays = $name ($value)", ({ value }) => {
    expect(() => assertValidRetention({ maxAgeDays: value })).not.toThrow();
  });

  test.each([
    { name: "negative", value: -1 },
    { name: "NaN", value: Number.NaN },
    { name: "Infinity", value: Number.POSITIVE_INFINITY },
    { name: "-Infinity", value: Number.NEGATIVE_INFINITY },
  ])("rejects maxAgeDays = $name ($value)", ({ value }) => {
    expect(() => assertValidRetention({ maxAgeDays: value })).toThrow(
      /maxAgeDays must be a non-negative finite number/,
    );
  });
});

describe("auditLog() factory wires retention validation", () => {
  test("constructs without throwing when retention is omitted", () => {
    expect(() => auditLog()).not.toThrow();
  });

  test("constructs without throwing when retention is false", () => {
    expect(() => auditLog({ retention: false })).not.toThrow();
  });

  test("throws at factory time on negative maxAgeDays — fails fast at app startup", () => {
    expect(() => auditLog({ retention: { maxAgeDays: -1 } })).toThrow(
      /maxAgeDays must be a non-negative finite number/,
    );
  });
});

describe("runRetentionPurge", () => {
  test("calls storage.purge with the cutoff computed from policy + clock", async () => {
    const ctx = fakeCtx();
    const { storage, purgeCalls } = fakeStorage({ withPurge: true });
    const now = new Date("2026-05-11T00:00:00Z");

    await runRetentionPurge(ctx as unknown as AppContext, {
      storage,
      retention: { maxAgeDays: 30 },
      now,
    });

    expect(purgeCalls).toHaveLength(1);
    expect(purgeCalls[0]?.cutoff.toISOString()).toBe(
      new Date("2026-04-11T00:00:00Z").toISOString(),
    );
  });

  test("returns the storage's deleted count", async () => {
    const ctx = fakeCtx();
    const { storage, purgeReturn } = fakeStorage({ withPurge: true });
    purgeReturn.deleted = 42;

    const result = await runRetentionPurge(ctx as unknown as AppContext, {
      storage,
      retention: { maxAgeDays: 7 },
    });

    expect(result.deleted).toBe(42);
  });

  test("retention: false is a no-op (no purge call, no warn)", async () => {
    const ctx = fakeCtx();
    const { storage, purgeCalls } = fakeStorage({ withPurge: true });

    const result = await runRetentionPurge(ctx as unknown as AppContext, {
      storage,
      retention: false,
    });

    expect(result).toEqual({ deleted: 0 });
    expect(purgeCalls).toHaveLength(0);
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  test("storage without purge() warns once and returns deleted: 0", async () => {
    const ctx = fakeCtx();
    const { storage } = fakeStorage({ withPurge: false });

    const result = await runRetentionPurge(ctx as unknown as AppContext, {
      storage,
      retention: { maxAgeDays: 30 },
    });

    expect(result).toEqual({ deleted: 0 });
    expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
    const message = String(ctx.logger.warn.mock.calls[0]?.[0]);
    expect(message).toContain("fake-no-purge");
    expect(message).toContain("retention skipped");
  });
});
