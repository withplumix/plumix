import { describe, expect, test } from "vitest";

import { createDispatcherHarness } from "./dispatcher.js";
import { createTestDb } from "./harness.js";

describe("createDispatcherHarness db option", () => {
  test("a supplied database is the one requests run against", async () => {
    const db = await createTestDb();
    const h = await createDispatcherHarness({ db });

    const admin = await h.seedUser("admin");
    const response = await h.fetch("/_plumix/rpc/auth/session", {
      method: "POST",
      json: {},
      as: admin,
    });
    response.assertStatus(200);
    expect(h.db).toBe(db);
  });

  test("without one, each harness gets its own fresh database", async () => {
    const first = await createDispatcherHarness();
    const second = await createDispatcherHarness();
    await first.seedUser();

    expect(await second.db.query.users.findMany()).toEqual([]);
  });
});
