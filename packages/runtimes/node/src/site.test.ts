import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PluginDescriptor } from "plumix/plugin";
import type { Scheduler } from "plumix/runtime";
import type { MockInstance } from "vitest";
import { plumix } from "plumix";
import { auth as authConfig } from "plumix/auth";
import { copyOwnerHistories } from "plumix/cli";
import { definePlugin } from "plumix/plugin";
import * as schema from "plumix/schema";
import { applyCoreTestSchema } from "plumix/test";
import { defineTheme, fallback } from "plumix/theme";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { NodeConfig } from "./adapter.js";
import type { CronOverrides, ServeProcessOptions } from "./site.js";
import { node } from "./adapter.js";
import { listen } from "./http/test-support.js";
import { nodeSqlite } from "./node-sqlite.js";
import { createNodeSite, loadEnvFileWhenMain, serveProcess } from "./site.js";
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

/** `connectScheduledDb`'s request path, which core does not export. */
const SCHEDULED_PATH = "/_plumix/internal/scheduled";

const failing = definePlugin("failing", (ctx) => {
  ctx.registerScheduledTask({
    id: "always-fails",
    cron: CRON,
    handler: () => Promise.reject(new Error("boom")),
  });
});

/** A built site logs to stdout; the spy keeps it out of the test output and holds what was written. */
const captureStdout = () =>
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const quiet = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

let dir: string;
const servers: Server[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-site-"));
  mkdirSync(join(dir, "server"));
  mkdirSync(join(dir, "client/assets"), { recursive: true });
  // An ephemeral port, so nothing here can collide with a suite's fixed one.
  vi.stubEnv("PORT", "0");
  vi.stubEnv("HOST", "127.0.0.1");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // A test that failed before its drain leaves these behind, and one would
  // drain rather than exit when the pool terminates the worker.
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((shut) => server.close(shut))),
  );
  rmSync(dir, { recursive: true, force: true });
});

interface SiteOptions {
  readonly plugins?: PluginDescriptor[];
  readonly runtime?: NodeConfig;
  /**
   * Leaves the database empty and ships the histories beside the entry, as
   * `plumix build` does, for the server to apply when it starts.
   */
  readonly unmigrated?: boolean;
  /** The `migrations/data-migrations.js` an unmigrated site ships. */
  readonly dataMigrations?: string;
}

/**
 * The shape `plumix build` emits, which is how `entryUrl` resolves the assets
 * directory. Records each connection the site opens and closes.
 */
async function siteFor({
  plugins = [],
  runtime = {},
  unmigrated = false,
  dataMigrations = "export default [];\n",
}: SiteOptions = {}) {
  const inner = nodeSqlite({ path: join(dir, "site.sqlite") });
  if (!unmigrated) {
    await applyCoreTestSchema(
      inner.connect({}, new Request("https://cms.example/"), schema).db,
    );
  }
  const connected: string[] = [];
  const closed: string[] = [];
  const database: typeof inner = {
    ...inner,
    connect: (env, request, tables) => {
      const path = new URL(request.url).pathname;
      connected.push(path);
      const connection = inner.connect(env, request, tables);
      return {
        ...connection,
        close: () => {
          closed.push(path);
          connection.close();
        },
      };
    },
  };
  const config = plumix({
    runtime: node(runtime),
    database,
    auth,
    theme,
    plugins,
  });
  if (unmigrated) {
    copyOwnerHistories(
      { cwd: dir, configPath: join(dir, "plumix.config.ts"), config },
      join(dir, "server"),
    );
    writeFileSync(
      join(dir, "server/migrations/data-migrations.js"),
      dataMigrations,
    );
  }
  const site = createNodeSite({
    config,
    assetManifest: {},
    entryUrl: pathToFileURL(join(dir, "server/worker.js")).href,
  });
  return { site, connected, closed };
}

function tables(): unknown[] {
  const db = new DatabaseSync(join(dir, "site.sqlite"));
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

describe("createNodeSite — scheduled", () => {
  test("answers with the run's report, so a failed task is not swallowed", async () => {
    captureStdout();
    const { site } = await siteFor({ plugins: [failing] });

    const report = await site.handler.scheduled({
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T03:00:00Z"),
    });

    // `ran` also counts core's own `*/5` task, which shares this minute.
    expect(report).toMatchObject({ failed: ["failing:always-fails"] });
  });

  test("the report reaches the scheduler's failure logging", async () => {
    // The whole chain the shipped cron path walks; dropping the return anywhere
    // leaves an operator with silence.
    captureStdout();
    const { site } = await siteFor({ plugins: [failing] });
    const clock = virtualClock("2026-09-07T02:58:00Z");
    const logger = quiet();

    const cron = await site.startCron({
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

  test("the scheduler's run guard writes to the site's own database", async () => {
    const { site, connected } = await siteFor();
    const overrides: CronOverrides = {
      lease: false,
      logger: quiet(),
      // @ts-expect-error -- a test seam, not an embedder's override (#2461)
      db: undefined,
    };

    const cron = await site.startCron(overrides);
    await cron.stop();

    expect(connected).toContain(SCHEDULED_PATH);
  });

  test("stopping the cron aborts a running task's ctx.signal, so it stops instead of being cut off", async () => {
    captureStdout();
    let signal: AbortSignal | undefined;
    const hung = definePlugin("hung", (ctx) => {
      ctx.registerScheduledTask({
        id: "waits",
        cron: CRON,
        handler: (taskCtx) =>
          new Promise<void>((resolve) => {
            signal = taskCtx.signal;
            taskCtx.signal.addEventListener("abort", () => resolve());
          }),
      });
    });
    const { site } = await siteFor({ plugins: [hung] });
    const clock = virtualClock("2026-09-07T02:58:00Z");

    const cron = await site.startCron({ lease: false, clock, logger: quiet() });
    await clock.advanceTo("2026-09-07T03:00:30Z");
    expect(signal?.aborted).toBe(false);

    expect(await cron.stop({ timeoutMs: 1_000 })).toBe(true);
    expect(signal?.reason).toMatchObject({
      name: "AbortError",
      cause: "shutdown",
    });
  });
});

describe("createNodeSite — logs", () => {
  test("a built site writes each log call to stdout as one JSON line, with the error's stack", async () => {
    const stdout = captureStdout();
    const { site } = await siteFor({ plugins: [failing] });

    await site.handler.scheduled({
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T03:00:00Z"),
    });

    const lines = stdout.mock.calls.map(([chunk]) => String(chunk));
    expect(lines.every((line) => line.endsWith("\n"))).toBe(true);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: `[plumix] scheduled task "failing:always-fails" failed: boom`,
        plugin: "failing",
        error: expect.objectContaining({
          name: "Error",
          message: "boom",
          stack: expect.stringContaining("Error: boom") as unknown,
        }) as unknown,
      }),
    );
  });

  test("under dev a site keeps logging to the console, not JSON on stdout", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const stdout = captureStdout();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { site } = await siteFor({ plugins: [failing] });

    await site.handler.scheduled({
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T03:00:00Z"),
    });

    expect(error).toHaveBeenCalledWith(
      `[plumix] scheduled task "failing:always-fails" failed: boom`,
      expect.objectContaining({ taskId: "always-fails", plugin: "failing" }),
    );
    expect(stdout).not.toHaveBeenCalled();
  });

  test("a built site's cron writes its own lines as JSON too", async () => {
    const stdout = captureStdout();
    const { site } = await siteFor({ plugins: [failing] });
    const clock = virtualClock("2026-09-07T02:58:00Z");

    const cron = await site.startCron({ lease: false, clock });
    await clock.advanceTo("2026-09-07T03:00:30Z");
    await cron.stop();

    const records = stdout.mock.calls.map(
      ([chunk]) => JSON.parse(String(chunk)) as unknown,
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: `[plumix] cron "${CRON}": 1 task(s) failed: failing:always-fails`,
      }),
    );
  });
});

describe("createNodeSite — serve chain", () => {
  test("serves a built asset from disk ahead of the site", async () => {
    writeFileSync(join(dir, "client/assets/app.js"), "export const a = 1;\n");
    const { site } = await siteFor();

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
    const { site } = await siteFor();

    const response = await site.handler.fetch(
      new Request("https://cms.example/_plumix/admin/entries/new"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>admin</title>");
  });
});

describe("createNodeSite — serveWhenMain", () => {
  test("starts nothing when the entry was imported rather than run", async () => {
    const { site } = await siteFor();
    const before = process.listenerCount("SIGTERM");

    expect(await site.serveWhenMain(false)).toBeUndefined();

    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  test.for([
    { cron: undefined, starts: true },
    { cron: false, starts: false },
  ])(
    "honours the runtime's `cron: $cron`, and drains through the site's own dispose",
    async ({ cron, starts }, { signal }) => {
      // A body that outlives its timeout runs on after `afterEach`; the first
      // check stops it starting a server nothing tears down.
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const { site, connected, closed } = await siteFor({
        runtime: { cron },
        unmigrated: true,
      });
      signal.throwIfAborted();

      const running = await site.serveWhenMain(true);
      assert(running);
      servers.push(running.server);
      // `startCron` waits on the same `buildApp` a request does and registered
      // first, so once a request is answered the scheduler has opened its
      // connection or never will.
      await site.handler.fetch(new Request("https://cms.example/"));
      signal.throwIfAborted();

      expect(connected.includes(SCHEDULED_PATH)).toBe(starts);
      await running.drain("SIGTERM");
      expect(exit).toHaveBeenCalledWith(0);
      expect(closed).toContain("/");
      expect(log).toHaveBeenCalledWith("plumix: SIGTERM received, draining");
    },
  );
});

describe("createNodeSite — migrations at startup", () => {
  test("creates every owner's tables in an empty database before it listens", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { site } = await siteFor({ unmigrated: true });

    const running = await site.serveWhenMain(true);
    assert(running);
    servers.push(running.server);

    expect(tables()).toContain("entries");
  });

  test("against an up-to-date database applies nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { site } = await siteFor({ unmigrated: true });
    const first = await site.serveWhenMain(true);
    assert(first);
    servers.push(first.server);
    stderr.mockClear();

    const second = await site.serveWhenMain(true);
    assert(second);
    servers.push(second.server);

    expect(stderr.mock.calls.map(([chunk]) => String(chunk))).toEqual([
      "core: up to date\n",
    ]);
  });

  // A built site's data bundle, written by hand: its `up` runs a SQL string,
  // so it imports nothing.
  const flagsBundle = (up: string) => `export default [
  {
    owner: "@acme/plugin-flags",
    migrations: [
      {
        name: "seed-beta",
        async up({ db }) {
          ${up}
        },
      },
    ],
  },
];
`;
  const SEED_BETA = flagsBundle(
    `await db.run("INSERT INTO settings (\\"group\\", key, value) VALUES ('flags', 'beta', 'true')");`,
  );

  function recorded(): unknown[] {
    const db = new DatabaseSync(join(dir, "site.sqlite"));
    try {
      return db
        .prepare(`SELECT owner, name FROM __plumix_data_migrations`)
        .all();
    } finally {
      db.close();
    }
  }

  test("applies a pending data migration after the histories, before it listens", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { site } = await siteFor({
      unmigrated: true,
      dataMigrations: SEED_BETA,
    });

    const running = await site.serveWhenMain(true);
    assert(running);
    servers.push(running.server);

    const db = new DatabaseSync(join(dir, "site.sqlite"));
    try {
      expect(
        db.prepare(`SELECT key FROM settings WHERE "group" = 'flags'`).all(),
      ).toEqual([{ key: "beta" }]);
    } finally {
      db.close();
    }
    expect(stderr.mock.calls.map(([chunk]) => String(chunk))).toContainEqual(
      expect.stringMatching(
        / @acme\/plugin-flags: applied 1 data migration\n$/,
      ),
    );
  });

  test("a second start reports its data migrations up to date and runs none", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { site } = await siteFor({
      unmigrated: true,
      dataMigrations: SEED_BETA,
    });
    const first = await site.serveWhenMain(true);
    assert(first);
    servers.push(first.server);
    stderr.mockClear();

    // A rerun of the insert would fail on the settings primary key.
    const second = await site.serveWhenMain(true);
    assert(second);
    servers.push(second.server);

    expect(stderr.mock.calls.map(([chunk]) => String(chunk))).toEqual([
      "core: up to date\n",
      "@acme/plugin-flags: data migrations up to date\n",
    ]);
  });

  test("a throwing data migration exits non-zero without listening or recording it", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { site } = await siteFor({
      unmigrated: true,
      dataMigrations: flagsBundle(`throw new Error("the flag is gone");`),
    });

    const running = await site.serveWhenMain(true);

    expect(running).toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "plumix: migrations failed; not serving",
      expect.objectContaining({ code: "migrate_data_failed" }),
    );
    expect(recorded()).toEqual([]);
  });

  test("a failed apply exits non-zero without listening", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { site } = await siteFor({ unmigrated: true });
    writeFileSync(join(dir, "site.sqlite"), "not a database");

    const running = await site.serveWhenMain(true);

    expect(running).toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "plumix: migrations failed; not serving",
      expect.any(Error),
    );
  });
});

describe("createNodeSite — shutdown", () => {
  // A promise the test settles, and a way to settle it.
  function gate() {
    let open: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { opened, open };
  }

  // `/slow` answers once the test releases it; `/defer` hands the site work
  // the test finishes; `/defer-stuck` hands it work that never settles.
  function probes() {
    const arrived = gate();
    const release = gate();
    const deferred = gate();
    let drained = false;
    const plugin = definePlugin("probes", (ctx) => {
      ctx.registerPublicRoute({
        path: "/slow",
        handler: async () => {
          arrived.open();
          await release.opened;
          return new Response("slow response");
        },
      });
      ctx.registerPublicRoute({
        path: "/defer",
        handler: (_request, app) => {
          app.defer(deferred.opened.then(() => void (drained = true)));
          return new Response("deferred");
        },
      });
      ctx.registerPublicRoute({
        path: "/defer-stuck",
        handler: (_request, app) => {
          app.defer(new Promise(() => undefined));
          return new Response("stuck");
        },
      });
    });
    return {
      plugin,
      arrived: arrived.opened,
      release: release.open,
      finish: deferred.open,
      drained: () => drained,
    };
  }

  // No keep-alive: an idle socket left open after the response would hold the
  // drain until its own timeout, which is not what this case is about.
  function getOnce(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      get(url, { agent: false }, (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => resolve(body));
      }).on("error", reject);
    });
  }

  async function serving(site: Awaited<ReturnType<typeof siteFor>>["site"]) {
    const exit = vi.fn();
    const running = serveProcess({
      listener: site.listener,
      startCron: site.startCron,
      dispose: site.dispose,
      cron: false,
      exit,
      drainDeadlineMs: 600,
    });
    servers.push(running.server);
    if (!running.server.listening) {
      await new Promise((up) => running.server.once("listening", up));
    }
    const { port } = running.server.address() as AddressInfo;
    return { exit, origin: `http://127.0.0.1:${String(port)}`, ...running };
  }

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("SIGTERM lets an in-flight response finish, then exits 0", async () => {
    const probe = probes();
    const { site } = await siteFor({ plugins: [probe.plugin] });
    const { exit, drain, origin } = await serving(site);
    const pending = getOnce(`${origin}/slow`);
    await probe.arrived;

    const draining = drain("SIGTERM");
    probe.release();

    expect(await pending).toBe("slow response");
    await draining;
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("SIGTERM waits for pending deferred work, then exits 0", async () => {
    const probe = probes();
    const { site } = await siteFor({ plugins: [probe.plugin] });
    const response = await site.handler.fetch(
      new Request("https://cms.example/defer"),
    );
    expect(await response.text()).toBe("deferred");
    const { exit, drain } = await serving({
      ...site,
      // The work finishes only once the drain is already waiting on it, on a
      // later turn of the event loop than a drain that skipped it would exit.
      dispose: (options) => {
        const disposed = site.dispose(options);
        setTimeout(probe.finish, 25);
        return disposed;
      },
    });

    await drain("SIGTERM");

    expect(probe.drained()).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("a stuck deferred task is cut at the deadline, and the process exits 1 naming it", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const probe = probes();
    const { site } = await siteFor({ plugins: [probe.plugin] });
    await site.handler.fetch(new Request("https://cms.example/defer-stuck"));
    const { exit, drain } = await serving(site);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    const draining = drain("SIGTERM");
    await vi.advanceTimersByTimeAsync(599);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "plumix: exiting with 1 deferred task(s) abandoned",
    );
    await draining;
  });
});

describe("loadEnvFileWhenMain", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = process.cwd();
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(cwd);
  });

  test("loads .env from the working directory, and a variable the environment already set wins", () => {
    writeFileSync(join(dir, ".env"), "PROBE_A=fromfile\nPROBE_B=fromfile\n");
    vi.stubEnv("PROBE_A", "platform");
    vi.stubEnv("PROBE_B", undefined);

    loadEnvFileWhenMain(true);

    expect(process.env).toMatchObject({
      PROBE_A: "platform",
      PROBE_B: "fromfile",
    });
  });

  test("with no .env file it loads nothing and does not throw", () => {
    vi.stubEnv("PROBE_A", undefined);

    loadEnvFileWhenMain(true);

    expect(process.env).not.toHaveProperty("PROBE_A");
  });
});

describe("serveProcess", () => {
  const noop: ServeProcessOptions["listener"] = (_req, res) => res.end();

  // A serving process announces binding and draining on stdout. Whether the
  // bind lands before a test drains is a race, so every test here takes it.
  let log: MockInstance<typeof console.log>;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  function harness(overrides: Partial<ServeProcessOptions> = {}) {
    const exit = vi.fn();
    const startCron = vi.fn(() => Promise.resolve(stubScheduler()));
    const running = serveProcess({
      listener: noop,
      cron: true,
      startCron,
      dispose: () => Promise.resolve({ abandoned: 0 }),
      exit,
      ...overrides,
    });
    servers.push(running.server);
    return { exit, startCron, ...running };
  }

  async function bound(server: Server): Promise<AddressInfo> {
    if (!server.listening) {
      await new Promise((up) => server.once("listening", up));
    }
    return server.address() as AddressInfo;
  }

  function stubScheduler(): Scheduler {
    return {
      start: () => Promise.resolve(),
      stop: vi.fn(() => Promise.resolve(true)),
    };
  }

  test("cron: false hands the schedules to an external scheduler", async () => {
    const { startCron, drain } = harness({ cron: false });

    await drain("SIGTERM");

    expect(startCron).not.toHaveBeenCalled();
  });

  test("stops the scheduler before the drain, and bounds both", async () => {
    const order: string[] = [];
    let stopBudget: number | undefined;
    let disposeBudget: number | undefined;
    const scheduler: Scheduler = {
      start: () => Promise.resolve(),
      stop: (options) => {
        order.push("stop");
        stopBudget = options?.timeoutMs;
        return Promise.resolve(true);
      },
    };
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

    // `dispose()` waits for deferred work, and a firing that started behind it
    // would hand it more. Unbounded, either could hold SIGTERM open until the
    // orchestrator SIGKILLs.
    expect(order).toEqual(["stop", "dispose"]);
    expect(stopBudget).toBeGreaterThan(0);
    expect(disposeBudget).toBeGreaterThan(0);
  });

  test("stops a scheduler that finishes starting after the signal landed", async () => {
    // `buildApp` may still be running when SIGTERM arrives; the scheduler must
    // not start behind the shutdown and fire into its drain.
    const scheduler = stubScheduler();
    let start: (value: Scheduler) => void = () => undefined;
    const { drain } = harness({
      startCron: () => new Promise<Scheduler>((resolve) => (start = resolve)),
    });

    const draining = drain("SIGTERM");
    start(scheduler);
    await draining;
    await Promise.resolve();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- call check, not invocation
    expect(scheduler.stop).toHaveBeenCalledWith({ timeoutMs: 0 });
  });

  test("spends one budget across the whole shutdown, not one per step", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const BUDGET = 600;
    const STOP = 500;
    const clock = virtualClock("2026-09-07T03:00:00.000Z");
    const stop = vi.fn(() => clock.sleep(STOP).then(() => true));
    const dispose = vi.fn(() => Promise.resolve({ abandoned: 0 }));
    let arrive = (): void => undefined;
    const arrived = new Promise<void>((resolve) => (arrive = resolve));
    const { exit, drain, server } = harness({
      clock,
      drainDeadlineMs: BUDGET,
      // Never answers, so the drain falls through to its deadline;
      // `closeIdleConnections()` would reap a socket that sent no request.
      listener: () => arrive(),
      startCron: () =>
        Promise.resolve({ start: () => Promise.resolve(), stop }),
      dispose,
    });
    await Promise.resolve();
    const { port } = await bound(server);
    const hung = fetch(`http://127.0.0.1:${String(port)}/`).catch(() => null);
    await arrived;

    const draining = drain("SIGTERM");
    await clock.advanceTo("2026-09-07T03:00:00.599Z");
    expect(exit).not.toHaveBeenCalled();
    await clock.advanceTo("2026-09-07T03:00:00.600Z");

    expect(log).toHaveBeenCalledWith(
      `plumix: listening on http://127.0.0.1:${String(port)}`,
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(stop).toHaveBeenCalledWith({ timeoutMs: BUDGET });
    expect(dispose).toHaveBeenCalledWith({ timeoutMs: 0 });
    expect(clock.now()).toBe(Date.parse("2026-09-07T03:00:00.600Z"));
    expect(error).toHaveBeenCalledWith(
      `plumix: exiting with in-flight responses cut; the ${String(BUDGET)}ms shutdown budget ran out`,
    );
    await draining;
    await hung;
  });

  test("exits non-zero and says so when the budget cut a scheduled run", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const scheduler: Scheduler = {
      ...stubScheduler(),
      stop: () => Promise.resolve(false),
    };
    const { exit, drain } = harness({
      startCron: () => Promise.resolve(scheduler),
    });
    await Promise.resolve();

    await drain("SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/scheduled run/));
  });

  test("exits non-zero when deferred work is abandoned", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { exit, drain } = harness({
      dispose: () => Promise.resolve({ abandoned: 2 }),
    });

    await drain("SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "plumix: exiting with 2 deferred task(s) abandoned",
    );
  });

  test("exits zero when everything drained", async () => {
    const { exit, drain } = harness();

    await drain("SIGTERM");

    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalledWith("plumix: SIGTERM received, draining");
  });
});
