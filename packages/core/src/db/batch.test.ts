import { describe, expect, test } from "vitest";

import type { Db } from "../context/app-context.js";
import { createTestDb } from "../test/harness.js";
import { runBatch } from "./batch.js";
import { settings } from "./schema/settings.js";

/** The test database as a sync driver sees it: no `batch`. */
function withoutBatch(db: Db): Db {
  return new Proxy(db, {
    get(target, name) {
      if (name === "batch") return undefined;
      const value: unknown = Reflect.get(target, name, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
    has: (target, name) => name !== "batch" && Reflect.has(target, name),
  });
}

describe("runBatch", () => {
  test("answers each statement's result in order on a driver with no batch", async () => {
    const db = withoutBatch(await createTestDb());

    const results = await runBatch(db, [
      db
        .insert(settings)
        .values({ group: "g", key: "a", value: 1 })
        .returning({ key: settings.key }),
      db
        .insert(settings)
        .values({ group: "g", key: "b", value: 2 })
        .returning({ key: settings.key }),
    ]);

    expect(results).toEqual([[{ key: "a" }], [{ key: "b" }]]);
  });
});
