import type { AppContext } from "plumix/plugin";
import { HookRegistry, installPlugins } from "plumix/plugin";
import { describe, expect, test, vi } from "vitest";

import type { AuditLogStorage } from "../types.js";
import { auditLog } from "../index.js";
import {
  assertValidRetention,
  computeRetentionCutoff,
  DEFAULT_PURGE_CRON,
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

describe("auditLog() factory registers the retention scheduled task", () => {
  test("default retention registers one task with the default cron", async () => {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [auditLog()],
    });
    expect(registry.scheduledTasks).toHaveLength(1);
    const task = registry.scheduledTasks[0];
    expect(task?.id).toBe("retention-purge");
    expect(task?.cron).toBe(DEFAULT_PURGE_CRON);
    expect(task?.registeredBy).toBe("audit_log");
  });

  test("custom purgeAt plumbs through to the registered task's cron", async () => {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        auditLog({ retention: { maxAgeDays: 30, purgeAt: "0 0 * * 0" } }),
      ],
    });
    expect(registry.scheduledTasks[0]?.cron).toBe("0 0 * * 0");
  });

  test("retention: false skips registration entirely", async () => {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [auditLog({ retention: false })],
    });
    expect(registry.scheduledTasks).toHaveLength(0);
  });

  test("handler invokes storage.purge with the cutoff and logs the deleted count", async () => {
    const storageStub = fakeStorage({ withPurge: true });
    storageStub.purgeReturn.deleted = 7;
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        auditLog({
          storage: storageStub.storage,
          retention: { maxAgeDays: 14 },
        }),
      ],
    });
    const task = registry.scheduledTasks[0];
    if (!task) throw new Error("expected one scheduled task");

    const logger = {
      debug: () => undefined,
      info: vi.fn(),
      warn: () => undefined,
      error: () => undefined,
    };
    await task.handler({ logger } as unknown as AppContext);

    expect(storageStub.purgeCalls).toHaveLength(1);
    // Cutoff sits in the past by `maxAgeDays`; just check it's a Date
    // (clock is `new Date()` inside runRetentionPurge — exact value
    // doesn't matter for this test, the math is covered above).
    expect(storageStub.purgeCalls[0]?.cutoff).toBeInstanceOf(Date);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(String(logger.info.mock.calls[0]?.[0])).toContain("deleted 7 rows");
  });

  test("handler renders the singular row count correctly", async () => {
    const storageStub = fakeStorage({ withPurge: true });
    storageStub.purgeReturn.deleted = 1;
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [auditLog({ storage: storageStub.storage })],
    });
    const task = registry.scheduledTasks[0];
    if (!task) throw new Error("expected one scheduled task");

    const logger = {
      debug: () => undefined,
      info: vi.fn(),
      warn: () => undefined,
      error: () => undefined,
    };
    await task.handler({ logger } as unknown as AppContext);

    expect(String(logger.info.mock.calls[0]?.[0])).toContain("deleted 1 row");
    expect(String(logger.info.mock.calls[0]?.[0])).not.toContain("1 rows");
  });
});
