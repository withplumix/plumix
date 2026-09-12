import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginDescriptor } from "plumix";
import {
  auth as authConfig,
  definePlugin,
  defineTheme,
  fallback,
  plumix,
} from "plumix";
import * as schema from "plumix/schema";
import { applyCoreTestSchema, createTestDb } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Scheduler } from "./scheduler.js";
import type { NodeSite, ServeProcessOptions } from "./site.js";
import { node } from "./adapter.js";
import { listen } from "./http/test-support.js";
import { nodeSqlite } from "./node-sqlite.js";
import { createNodeSite, serveProcess } from "./site.js";
import { virtualClock } from "./test/virtual-clock.js";

const auth = authConfig({
  passkey: {
    rpName: "Plumix Test",
    rpId: "cms.example",
    origin: "https://cms.example",
  },
});

const theme = defineTheme({ templates: [fallback(() => null)] });

const CRON = "*/5 * * * *";

const failing = definePlugin("failing", (ctx) => {
  ctx.registerScheduledTask({
    id: "always-fails",
    cron: CRON,
    handler: () => Promise.reject(new Error("boom")),
  });
});

const quiet = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-site-"));
  mkdirSync(join(dir, "server"));
  mkdirSync(join(dir, "client/assets"), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The same shape `plumix build` emits: the entry in `dist/server`, the client
// build beside it, which is how `entryUrl` resolves the assets directory.
async function siteFor(plugins: PluginDescriptor[] = []): Promise<NodeSite> {
  const database = nodeSqlite({ path: join(dir, "site.sqlite") });
  await applyCoreTestSchema(
    database.connect({}, new Request("https://cms.example/"), schema).db,
  );
  return createNodeSite({
    config: plumix({ runtime: node(), database, auth, theme, plugins }),
    assetManifest: {},
    entryUrl: pathToFileURL(join(dir, "server/worker.js")).href,
  });
}

describe("createNodeSite — scheduled", () => {
  test("answers with the run's report, so a failed task is not swallowed", async () => {
    const site = await siteFor([failing]);

    const report = await site.handler.scheduled({
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T03:00:00Z"),
    });

    // `ran` also counts core's own `*/5` task, which shares this minute.
    expect(report).toMatchObject({ failed: ["failing:always-fails"] });
  });

  test("the report reaches the scheduler's failure logging", async () => {
    // The whole chain the shipped cron path walks: firing → handler → report →
    // the one line that says the firing did not do its job. Dropping the
    // return anywhere along it leaves an operator with silence (#2303).
    const site = await siteFor([failing]);
    const clock = virtualClock("2026-09-07T02:58:00Z");
    const logger = quiet();

    const cron = await site.startCron({
      db: await createTestDb(),
      lease: false,
      clock,
      logger,
    });
    await clock.advanceTo("2026-09-07T03:00:30Z");
    await cron.stop();

    expect(logger.error).toHaveBeenCalledWith(
      `[plumix] cron "${CRON}": 1 task(s) failed: failing:always-fails`,
    );
  });
});

describe("createNodeSite — serve chain", () => {
  test("serves a built asset from disk ahead of the site", async () => {
    writeFileSync(join(dir, "client/assets/app.js"), "export const a = 1;\n");
    const site = await siteFor();

    const { origin } = await listen(site.listener);

    const asset = await fetch(`${origin}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("export const a = 1;\n");
    expect(asset.headers.get("cache-control")).toContain("immutable");

    // Anything the layers do not hold is the site's, which answers it all.
    expect((await fetch(`${origin}/`)).status).toBe(200);
  });

  test("the assets binding resolves an admin deep link through the entry's own directory", async () => {
    mkdirSync(join(dir, "client/_plumix/admin"), { recursive: true });
    writeFileSync(
      join(dir, "client/_plumix/admin/index.html"),
      "<!doctype html><title>admin</title>",
    );
    const site = await siteFor();

    const response = await site.handler.fetch(
      new Request("https://cms.example/_plumix/admin/entries/new"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>admin</title>");
  });
});

describe("createNodeSite — serveWhenMain", () => {
  test("starts nothing when the entry was imported rather than run", async () => {
    const site = await siteFor();
    const before = process.listenerCount("SIGTERM");

    site.serveWhenMain(false);

    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});

describe("serveProcess", () => {
  // The process seams the deleted string-matching tests used to assert on:
  // the cron gate, and the order the drain spends its one budget in.
  const noop: ServeProcessOptions["listener"] = (_req, res) => res.end();

  function harness(overrides: Partial<ServeProcessOptions> = {}) {
    const exit = vi.fn();
    const dispose = vi.fn(() => Promise.resolve({ abandoned: 0 }));
    const startCron = vi.fn(() => Promise.resolve(stubScheduler()));
    const process_ = serveProcess({
      listener: noop,
      cron: true,
      startCron,
      dispose,
      exit,
      ...overrides,
    });
    return { exit, dispose, startCron, drain: process_.drain };
  }

  function stubScheduler(): Scheduler {
    return {
      start: () => Promise.resolve(),
      stop: vi.fn(() => Promise.resolve()),
    };
  }

  beforeEach(() => {
    // An ephemeral port: the drain closes the server, so nothing is left bound.
    /* eslint-disable turbo/no-undeclared-env-vars -- what the built site reads when it runs, which is what this drives */
    process.env.PORT = "0";
    process.env.HOST = "127.0.0.1";
    /* eslint-enable turbo/no-undeclared-env-vars */
  });

  test("cron: false hands the schedules to an external scheduler", async () => {
    const { startCron, drain } = harness({ cron: false });

    await drain("SIGTERM");

    expect(startCron).not.toHaveBeenCalled();
  });

  test("stops the scheduler before the drain, within what is left of the budget", async () => {
    const order: string[] = [];
    const scheduler: Scheduler = {
      start: () => Promise.resolve(),
      stop: vi.fn((options?: { timeoutMs?: number }) => {
        order.push(`stop:${String(options?.timeoutMs !== undefined)}`);
        return Promise.resolve();
      }),
    };
    let disposeBudget: number | undefined;
    const { drain } = harness({
      startCron: () => Promise.resolve(scheduler),
      dispose: (options) => {
        order.push("dispose");
        disposeBudget = options?.timeoutMs;
        return Promise.resolve({ abandoned: 0 });
      },
    });
    // Let the cron start settle, the way `listen` gives it a tick in a process.
    await Promise.resolve();

    await drain("SIGTERM");

    // Unbounded, a multi-minute task in flight would hold SIGTERM open and
    // leave `dispose()` a zero budget, so the orchestrator SIGKILLs first.
    expect(order).toEqual(["stop:true", "dispose"]);
    expect(disposeBudget).toBeTypeOf("number");
  });

  test("stops a scheduler that finishes starting after the signal landed", async () => {
    // `buildApp` may still be running when SIGTERM arrives; the scheduler must
    // not start behind the shutdown and fire into its drain.
    const scheduler = stubScheduler();
    let started: (value: Scheduler) => void = () => undefined;
    const { drain } = harness({
      startCron: () => new Promise<Scheduler>((resolve) => (started = resolve)),
    });

    const draining = drain("SIGTERM");
    started(scheduler);
    await draining;
    await Promise.resolve();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- call check, not invocation
    expect(scheduler.stop).toHaveBeenCalledWith({ timeoutMs: 0 });
  });

  test("exits non-zero when deferred work is abandoned", async () => {
    const { exit, drain } = harness({
      dispose: () => Promise.resolve({ abandoned: 2 }),
    });

    await drain("SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
  });

  test("exits zero when everything drained", async () => {
    const { exit, drain } = harness();

    await drain("SIGTERM");

    expect(exit).toHaveBeenCalledWith(0);
  });
});
