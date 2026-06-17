import { describe, expect, it, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "./app.js";
import { registerCorePurgeInvalidator } from "../cache/purge.js";
import { requestStore } from "../context/stores.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { entryFactory, userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { registerCoreScheduledTasks } from "./register-core-scheduled-tasks.js";
import { runScheduledTasks } from "./scheduled.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

// End-to-end proof of the composed path: the `publish-scheduled` cron task →
// `entry:published` → the edge-cache purge subscriber → the flush at the end
// of `runScheduledTasks`. Each piece is unit-tested elsewhere; this guards
// that they're actually wired together so a scheduled publish purges the edge.
describe("scheduled publish purges the edge cache", () => {
  it("fires one purge for the published entry's tags", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "admin" });
    const due = await entryFactory.transient({ db }).create({
      authorId: user.id,
      type: "post",
      status: "scheduled",
      publishedAt: new Date(Date.now() - 1000),
    });

    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const registry = createPluginRegistry();
    registerCoreScheduledTasks(registry);
    const app = {
      scheduledTasks: registry.scheduledTasks,
    } as unknown as PlumixApp;

    const purgeTags = vi.fn(() => Promise.resolve());
    const ctx = {
      db,
      hooks,
      plugins: registry,
      cache: { match: vi.fn(), put: vi.fn(), purgeTags },
      defer: (p: Promise<unknown>) => {
        void p;
      },
      logger: silentLogger,
    } as unknown as AppContext;

    await requestStore.run(ctx, () =>
      runScheduledTasks(app, ctx, "*/5 * * * *"),
    );

    expect(purgeTags).toHaveBeenCalledTimes(1);
    expect(purgeTags).toHaveBeenCalledWith(["t:post", `e:${String(due.id)}`]);
  });

  it("does not purge when no cache is configured", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "admin" });
    await entryFactory.transient({ db }).create({
      authorId: user.id,
      type: "post",
      status: "scheduled",
      publishedAt: new Date(Date.now() - 1000),
    });

    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const registry = createPluginRegistry();
    registerCoreScheduledTasks(registry);
    const app = {
      scheduledTasks: registry.scheduledTasks,
    } as unknown as PlumixApp;

    const defer = vi.fn((p: Promise<unknown>) => {
      void p;
    });
    const ctx = {
      db,
      hooks,
      plugins: registry,
      cache: undefined,
      defer,
      logger: silentLogger,
    } as unknown as AppContext;

    await requestStore.run(ctx, () =>
      runScheduledTasks(app, ctx, "*/5 * * * *"),
    );

    expect(defer).not.toHaveBeenCalled();
  });
});
