import { describe, expect, it, vi } from "vitest";

import type { RegisteredScheduledTask } from "../plugin/registry.js";
import { registerCorePurgeInvalidator } from "../cdn/purge.js";
import { HookRegistry } from "../hooks/registry.js";
import { resolveReferences } from "../meta/core.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createTestContext } from "../test/context.js";
import { entryFactory, userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { createTracedContext } from "../test/traced-context.js";
import { registerCoreScheduledTasks } from "./register-core-scheduled-tasks.js";
import { runScheduledTasks } from "./scheduled.js";

// Each piece is unit-tested elsewhere; this guards that they are actually
// wired together.
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
    const app = { scheduledTasks: registry.scheduledTasks };

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

    await runScheduledTasks(app, ctx, "*/5 * * * *");

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
    const app = { scheduledTasks: registry.scheduledTasks };

    const defer = vi.fn((p: Promise<unknown>) => {
      void p;
    });
    const ctx = createTestContext({ db, hooks, plugins: registry, defer });

    await runScheduledTasks(app, ctx, "*/5 * * * *");

    expect(defer).not.toHaveBeenCalled();
  });
});

// One invocation shares one request memo, so a publish must drop stale rows
// for later tasks even with no cdn configured.
describe("scheduled publish is visible to later tasks in the invocation", () => {
  it("a task after publish-scheduled hydrates the published entry", async () => {
    const { harness, ctx } = await createTracedContext();
    const author = await harness.factory.user.create({});
    const due = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "scheduled",
      title: "Due",
      publishedAt: new Date(Date.now() - 1000),
    });
    const hydrated: (string | null)[] = [];
    const hydrate = (id: string): RegisteredScheduledTask => ({
      id,
      registeredBy: "test",
      handler: async (taskCtx) => {
        const [payload] = await resolveReferences(
          taskCtx,
          "entry",
          [String(due.id)],
          { scope: { entryTypes: ["post"] } },
        );
        hydrated.push(payload?.title ?? null);
      },
    });
    const app = {
      scheduledTasks: [
        hydrate("before"),
        ...harness.app.scheduledTasks,
        hydrate("after"),
      ],
    };

    const report = await runScheduledTasks(app, ctx);

    expect(report.failed).toEqual([]);
    expect(hydrated).toEqual([null, "Due"]);
  });
});
