import { describe, expect, test } from "vitest";

import type { Db } from "../context/app-context.js";
import { D1_MAX_BOUND_PARAMETERS } from "../db/index.js";
import { settings } from "../db/schema/settings.js";
import { SETTINGS_CREATED_KEY } from "../template-deps-core.js";
import { createTestDb } from "../test/harness.js";
import {
  insertAbsentSettingsKeys,
  settingsGroupEtag,
  writeSettingsKeys,
} from "./token.js";

/** The test db with `batch` swapped for the given one, or taken away. */
function withBatch(db: Db, batch: unknown): Db {
  return new Proxy(db, {
    get(target, name) {
      if (name === "batch") return batch;
      const value: unknown = Reflect.get(target, name, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
    has: (target, name) =>
      name === "batch" ? batch !== undefined : Reflect.has(target, name),
  });
}

async function keysOf(db: Db): Promise<string[]> {
  return (await db.select({ key: settings.key }).from(settings))
    .map((row) => row.key)
    .sort();
}

describe("settingsGroupEtag", () => {
  test("reads the token from the marker row wherever it sits", () => {
    expect(
      settingsGroupEtag([
        { key: "title", value: "A" },
        { key: SETTINGS_CREATED_KEY, value: 3 },
      ]),
    ).toBe("3");
  });
});

describe("writeSettingsKeys", () => {
  test("sends a driver's batch in one round trip, deletes within D1's parameter cap", async () => {
    const db = await createTestDb();
    const keys = Array.from({ length: 250 }, (_, i) => `k${i}`);
    await db
      .insert(settings)
      .values(keys.map((key) => ({ group: "g", key, value: 1 })));
    const sent: { params: unknown[] }[][] = [];
    const batching = withBatch(db, (items: readonly object[]) => {
      sent.push(
        items.map((item) =>
          (item as { toSQL(): { params: unknown[] } }).toSQL(),
        ),
      );
      return (
        db as unknown as { batch(i: readonly object[]): Promise<object[]> }
      ).batch(items);
    });

    await writeSettingsKeys(batching, "g", [{ key: "kept", value: 2 }], keys);

    expect(sent).toHaveLength(1);
    for (const statement of sent[0] ?? []) {
      expect(statement.params.length).toBeLessThanOrEqual(
        D1_MAX_BOUND_PARAMETERS,
      );
    }
    expect(await keysOf(db)).toEqual(["kept"]);
  });

  test("writes one statement at a time on a driver with no batch", async () => {
    const db = await createTestDb();
    await db.insert(settings).values({ group: "g", key: "gone", value: 1 });
    const sync = withBatch(db, undefined);

    await writeSettingsKeys(sync, "g", [{ key: "kept", value: 2 }], ["gone"]);

    expect(await keysOf(db)).toEqual(["kept"]);
  });
});

describe("insertAbsentSettingsKeys", () => {
  test("answers no key when the group holds them all", async () => {
    const db = await createTestDb();
    await db.insert(settings).values({ group: "g", key: "a", value: 1 });

    expect(
      await insertAbsentSettingsKeys(db, "g", [{ key: "a", value: 2 }]),
    ).toEqual([]);
  });

  test("stores a set larger than one statement can bind, keeping the keys held", async () => {
    const db = await createTestDb();
    await db.insert(settings).values({ group: "g", key: "k0", value: 0 });
    const rows = Array.from({ length: 120 }, (_, i) => ({
      key: `k${i}`,
      value: 1,
    }));

    const inserted = await insertAbsentSettingsKeys(db, "g", rows);

    expect(inserted).toHaveLength(119);
    expect(inserted).not.toContain("k0");
    expect(await keysOf(db)).toHaveLength(120);
  });
});
