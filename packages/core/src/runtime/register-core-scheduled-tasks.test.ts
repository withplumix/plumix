import { describe, expect, it } from "vitest";

import type { AppContext } from "../context/app.js";
import { sessions } from "../db/schema/sessions.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { registerCoreScheduledTasks } from "./register-core-scheduled-tasks.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe("registerCoreScheduledTasks", () => {
  it("registers a daily session-cleanup task that prunes expired sessions", async () => {
    const registry = createPluginRegistry();
    registerCoreScheduledTasks(registry);

    const task = registry.scheduledTasks.find(
      (t) => t.id === "session-cleanup",
    );
    expect(task).toBeDefined();
    expect(task?.cron).toBe("0 3 * * *");
    expect(task?.registeredBy).toBe("core");

    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "admin" });
    await db.insert(sessions).values([
      {
        id: "expired",
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
      },
      { id: "live", userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    ]);

    await task?.handler({ db, logger: silentLogger } as unknown as AppContext);

    const rows = await db.select({ id: sessions.id }).from(sessions);
    expect(rows).toEqual([{ id: "live" }]);
  });
});
