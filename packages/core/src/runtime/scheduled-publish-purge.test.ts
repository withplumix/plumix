import { describe, expect, it, vi } from "vitest";

import type { PlumixApp } from "./app.js";
import { registerCorePurgeInvalidator } from "../cdn/purge.js";
import { requestStore } from "../context/stores.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createTestContext } from "../test/context.js";
import { entryFactory, userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { registerCoreScheduledTasks } from "./register-core-scheduled-tasks.js";
import { runScheduledTasks } from "./scheduled.js";

// End-to-end proof of the composed path: the `publish-scheduled` cron task →
// `entry:published` → the CDN purge subscriber → the flush at the end
// of `runScheduledTasks`. Each piece is unit-tested elsewhere; this guards
// that they're actually wired together so a scheduled publish purges the CDN.
describe("scheduled publish purges the CDN", () => {
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
    const ctx = createTestContext({
      db,
      hooks,
      plugins: registry,
      cdn: { decorate: (response) => response, purgeTags },
      defer: (p) => {
        void p;
      },
    });

    await requestStore.run(ctx, () =>
      runScheduledTasks(app, ctx, "*/5 * * * *"),
    );

    expect(purgeTags).toHaveBeenCalledTimes(1);
    expect(purgeTags).toHaveBeenCalledWith(["t:post", `e:${String(due.id)}`]);
  });

  it("does not purge when no cdn is configured", async () => {
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
    const ctx = createTestContext({ db, hooks, plugins: registry, defer });

    await requestStore.run(ctx, () =>
      runScheduledTasks(app, ctx, "*/5 * * * *"),
    );

    expect(defer).not.toHaveBeenCalled();
  });
});
