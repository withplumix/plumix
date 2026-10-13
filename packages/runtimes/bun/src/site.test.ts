import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Server } from "bun";
import type { PluginDescriptor } from "plumix/plugin";
import { Database } from "bun:sqlite";
import { plumix } from "plumix";
import { auth as authConfig } from "plumix/auth";
import { copyOwnerHistories } from "plumix/cli";
import { definePlugin } from "plumix/plugin";
import * as schema from "plumix/schema";
import { applyCoreTestSchema } from "plumix/test";
import { defineTheme, fallback } from "plumix/theme";
import {
  afterAll,
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { BunConfig } from "./adapter.js";
import { bun } from "./adapter.js";
import { bunSqlite } from "./bun-sqlite.js";
import { createBunSite, loadEnvFileWhenMain, serveProcess } from "./site.js";
import { virtualClock } from "./test/virtual-clock.js";

const CHUNK = "export const client = 1;";

const auth = authConfig({
  passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost" },
});
const theme = defineTheme({ templates: [fallback(() => null)] });

const echo = definePlugin("echo", (ctx) => {
  ctx.registerPublicRoute({
    path: "/whoami",
    handler: (request, app) =>
      Response.json({ url: request.url, address: app.clientAddress ?? null }),
  });
});

/** The signal of each `/stream` request, in arrival order. */
const streamSignals: AbortSignal[] = [];

const wire = definePlugin("wire", (ctx) => {
  ctx.registerPublicRoute({
    path: "/cookies",
    handler: () => {
      const headers = new Headers();
      headers.append("set-cookie", "first=1; Path=/; HttpOnly");
      headers.append("set-cookie", "second=2; Path=/; HttpOnly");
      return new Response("cookies", { headers });
    },
  });
  ctx.registerPublicRoute({
    path: "/events",
    handler: () =>
      new Response("data: first\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
  });
  // One chunk, then held open until the client goes.
  ctx.registerPublicRoute({
    path: "/stream",
    handler: (request) => {
      streamSignals.push(request.signal);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("first chunk"));
          },
        }),
      );
    },
  });
});

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "plumix-bun-site-"));
  mkdirSync(join(dir, "dist/client/assets"), { recursive: true });
  writeFileSync(join(dir, "dist/client/assets/client-abc123.js"), CHUNK);
  await applyCoreTestSchema(
    bunSqlite({ path: join(dir, "site.sqlite") }).connect(
      {},
      new Request("http://localhost/"),
      schema,
    ).db,
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function siteFor(config: BunConfig, plugins = [echo, wire]) {
  return createBunSite({
    config: plumix({
      runtime: bun(config),
      database: bunSqlite({ path: join(dir, "site.sqlite") }),
      auth,
      theme,
      plugins,
    }),
    assetManifest: {},
    entryUrl: pathToFileURL(join(dir, "dist/server/worker.js")).href,
  });
}

/**
 * The site's serve options on a real `Bun.serve`, so the address and the URL
 * are what Bun hands a request from a real socket.
 */
async function served(
  config: BunConfig,
  body: (origin: string, server: Server<undefined>) => Promise<void>,
): Promise<void> {
  const site = siteFor(config);
  const server = Bun.serve({ ...site.serve, port: 0, hostname: "127.0.0.1" });
  try {
    await body(`http://127.0.0.1:${String(server.port)}`, server);
  } finally {
    await server.stop(true);
    await site.dispose();
  }
}

const FORGED = {
  "x-forwarded-proto": "https",
  "x-forwarded-host": "cms.example",
  "x-forwarded-for": "198.51.100.1, 203.0.113.9",
};

describe("the site on Bun.serve", () => {
  test("with trustProxy off, forged forwarded headers are ignored and the address is the socket's", () =>
    served({}, async (origin) => {
      const response = await fetch(`${origin}/whoami?q=1`, {
        headers: FORGED,
      });
      expect(await response.json()).toEqual({
        url: `${origin}/whoami?q=1`,
        address: "127.0.0.1",
      });
    }));

  test("with trustProxy on, the forwarded scheme, host and rightmost address are honoured", () =>
    served({ trustProxy: true }, async (origin) => {
      const response = await fetch(`${origin}/whoami`, { headers: FORGED });
      expect(await response.json()).toEqual({
        url: "https://cms.example/whoami",
        address: "203.0.113.9",
      });
    }));

  test("a built asset is served ahead of the handler, and an unknown path falls through to it", () =>
    served({}, async (origin) => {
      const chunk = await fetch(`${origin}/assets/client-abc123.js`);
      expect(await chunk.text()).toBe(CHUNK);
      expect(chunk.headers.get("cache-control")).toContain("immutable");
      const fallthrough = await fetch(`${origin}/whoami`);
      expect(fallthrough.status).toBe(200);
    }));

  test("delivers each cookie a response sets as its own Set-Cookie header", () =>
    served({}, async (origin) => {
      const response = await fetch(`${origin}/cookies`);

      expect(response.headers.getSetCookie()).toEqual([
        "first=1; Path=/; HttpOnly",
        "second=2; Path=/; HttpOnly",
      ]);
    }));

  test("a client disconnecting mid-stream aborts the request's signal", () =>
    served({}, async (origin) => {
      streamSignals.length = 0;
      const client = new AbortController();
      const response = await fetch(`${origin}/stream`, {
        signal: client.signal,
      });
      await response.body?.getReader().read();

      client.abort();

      await vi.waitFor(() => expect(streamSignals[0]?.aborted).toBe(true));
    }));

  // `/whoami` takes only GET, so a body Bun lets through reaches the site and
  // is answered 405.
  test.each([
    { bytes: 2048, status: 413 },
    { bytes: 1024, status: 405 },
  ])(
    "under a 1024-byte body limit, a $bytes-byte body is answered $status",
    ({ bytes, status }) =>
      served({ bodySizeLimit: 1024 }, async (origin) => {
        const response = await fetch(`${origin}/whoami`, {
          method: "POST",
          body: "x".repeat(bytes),
        });

        expect(response.status).toBe(status);
      }),
  );

  test("exempts an event stream from the idle timeout", () =>
    served({}, async (origin, server) => {
      const timeout = vi.spyOn(server, "timeout");

      await (await fetch(`${origin}/events`)).text();

      expect(timeout).toHaveBeenCalledExactlyOnceWith(expect.any(Request), 0);
    }));

  test("leaves every other response to the idle timeout", () =>
    served({}, async (origin, server) => {
      const timeout = vi.spyOn(server, "timeout");

      await (await fetch(`${origin}/whoami`)).text();

      expect(timeout).not.toHaveBeenCalled();
    }));
});

describe("createBunSite — serve options", () => {
  // Bun's own default of 10 would cut a render slower than that.
  test.each([
    { config: {}, idleTimeout: 30 },
    { config: { idleTimeout: 0 }, idleTimeout: 0 },
    { config: { idleTimeout: 120 }, idleTimeout: 120 },
  ])(
    "with $config, Bun.serve idles connections out after $idleTimeout s",
    ({ config, idleTimeout }) => {
      const site = siteFor(config);

      expect(site.serve.idleTimeout).toBe(idleTimeout);
    },
  );
});

describe("the served process migrates before it listens", () => {
  let project: string;
  const servers: { stop: (force: boolean) => Promise<void> }[] = [];

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "plumix-bun-serve-"));
    vi.stubEnv("PORT", "0");
    vi.stubEnv("HOST", "127.0.0.1");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop(true)));
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(project, { recursive: true, force: true });
  });

  // An empty database, with the histories shipped beside the entry as
  // `plumix build` does.
  function builtSite() {
    const config = plumix({
      runtime: bun({}),
      database: bunSqlite({ path: join(project, "site.sqlite") }),
      auth,
      theme,
    });
    copyOwnerHistories(
      { cwd: project, configPath: join(project, "plumix.config.ts"), config },
      join(project, "dist/server"),
    );
    return createBunSite({
      config,
      assetManifest: {},
      entryUrl: pathToFileURL(join(project, "dist/server/worker.js")).href,
    });
  }

  function tables(): unknown[] {
    const db = new Database(join(project, "site.sqlite"));
    try {
      return db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table'",
        )
        .all()
        .map((row) => row.name);
    } finally {
      db.close();
    }
  }

  test("creates every owner's tables in an empty database", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const site = builtSite();

    const server = await serveProcess(site);
    assert(server);
    servers.push(server);

    expect(tables()).toContain("entries");
  });

  test("against an up-to-date database applies nothing", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const site = builtSite();
    const first = await serveProcess(site);
    assert(first);
    servers.push(first);
    stderr.mockClear();

    const second = await serveProcess(site);
    assert(second);
    servers.push(second);

    expect(stderr.mock.calls.map(([chunk]) => String(chunk))).toEqual([
      "core: up to date\n",
    ]);
  });

  test("a failed apply exits non-zero without listening", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const site = builtSite();
    writeFileSync(join(project, "site.sqlite"), "not a database");

    const server = await serveProcess(site);

    expect(server).toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "plumix: migrations failed; not serving",
      expect.any(Error),
    );
  });
});

describe("serveProcess", () => {
  let project: string;
  const servers: { stop: (force: boolean) => Promise<void> }[] = [];

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "plumix-bun-process-"));
    vi.stubEnv("PORT", "0");
    vi.stubEnv("HOST", "127.0.0.1");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop(true)));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(project, { recursive: true, force: true });
  });

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

  // The histories shipped beside the entry, as `plumix build` does.
  function siteWith(plugins: PluginDescriptor[] = []) {
    const config = plumix({
      runtime: bun({}),
      database: bunSqlite({ path: join(project, "site.sqlite") }),
      auth,
      theme,
      plugins,
    });
    copyOwnerHistories(
      { cwd: project, configPath: join(project, "plumix.config.ts"), config },
      join(project, "dist/server"),
    );
    return createBunSite({
      config,
      assetManifest: {},
      entryUrl: pathToFileURL(join(project, "dist/server/worker.js")).href,
    });
  }

  // The signals and the clock are the test's, so a drain runs without a real
  // signal and its deadline passes without the real ten seconds.
  async function serving(site: ReturnType<typeof siteWith>) {
    const signals = new EventEmitter();
    const clock = virtualClock("2026-10-13T10:00:00Z");
    const exit = vi.fn<(code: number) => void>();
    const server = await serveProcess(site, { signals, clock, exit });
    assert(server);
    servers.push(server);
    return {
      signals,
      clock,
      exit,
      origin: `http://127.0.0.1:${String(server.port)}`,
    };
  }

  test("listens on the port it was given and says so once", async () => {
    const log = vi.mocked(console.log);

    const { origin } = await serving(siteWith());

    expect(log).toHaveBeenCalledExactlyOnceWith(
      `plumix: listening on ${origin}`,
    );
    expect((await fetch(`${origin}/`)).status).toBe(200);
  });

  test("SIGTERM lets an in-flight response finish, then exits 0", async () => {
    const probe = probes();
    const { signals, exit, origin } = await serving(siteWith([probe.plugin]));
    const pending = fetch(`${origin}/slow`);
    await probe.arrived;

    signals.emit("SIGTERM", "SIGTERM");
    probe.release();

    expect(await (await pending).text()).toBe("slow response");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  test("SIGTERM waits for pending deferred work, then exits 0", async () => {
    const probe = probes();
    const site = siteWith([probe.plugin]);
    await site.handler.fetch(new Request("http://localhost/defer"));
    const { signals, exit } = await serving({
      ...site,
      // The work finishes only once the drain is already waiting on it.
      dispose: (options) => {
        const disposed = site.dispose(options);
        probe.finish();
        return disposed;
      },
    });
    const drainedAtExit: boolean[] = [];
    exit.mockImplementation(() => void drainedAtExit.push(probe.drained()));

    signals.emit("SIGTERM", "SIGTERM");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(drainedAtExit).toEqual([true]);
  });

  // A response and a deferred task that never finish, with the drain started
  // and sleeping toward its deadline.
  async function drainingStalled() {
    const probe = probes();
    const site = siteWith([probe.plugin]);
    await site.handler.fetch(new Request("http://localhost/defer-stuck"));
    const { signals, clock, exit, origin } = await serving(site);
    const stuck = fetch(`${origin}/slow`).then(
      (response) => response.text(),
      () => "cut",
    );
    await probe.arrived;
    signals.emit("SIGTERM", "SIGTERM");
    await vi.waitFor(() => expect(clock.sleeping()).toBe(1));
    return { clock, exit, stuck, release: probe.release };
  }

  test("a millisecond before the deadline it has cut nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { clock, exit, release } = await drainingStalled();

    await clock.advanceTo("2026-10-13T10:00:09.999Z");

    expect(exit).not.toHaveBeenCalled();
    release();
  });

  test("at the deadline it cuts what is still running, and exits 1 naming it", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // The abandoned work's warning, which a built site logs as JSON.
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { clock, exit, stuck, release } = await drainingStalled();

    await clock.advanceTo("2026-10-13T10:00:10Z");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(await stuck).toBe("cut");
    expect(error).toHaveBeenCalledWith(
      "plumix: exiting with in-flight responses cut; the 10000ms shutdown budget ran out",
    );
    expect(error).toHaveBeenCalledWith(
      "plumix: exiting with 1 deferred task(s) abandoned",
    );
    release();
  });

  test("takes both signal listeners off at the first signal, so a second one ends the process at once", async () => {
    const { signals } = await serving(siteWith());

    signals.emit("SIGTERM", "SIGTERM");

    expect(console.log).toHaveBeenCalledWith(
      "plumix: SIGTERM received, draining",
    );
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });
});

describe("the site's cron", () => {
  const fired: string[] = [];
  let cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    fired.length = 0;
    await Promise.all(cleanups.map((cleanup) => cleanup()));
    cleanups = [];
  });

  // A task declared on `* * * * *`, with the cron started at half past the
  // minute on a clock the test moves.
  async function tickingEveryMinute() {
    const ticking = definePlugin("ticking", (ctx) => {
      ctx.registerScheduledTask({
        id: "tick",
        cron: "* * * * *",
        handler: () => void fired.push("tick"),
      });
    });
    const site = siteFor({}, [ticking]);
    const clock = virtualClock("2026-10-13T10:00:30Z");
    const cron = await site.startCron({ lease: false, clock });
    cleanups.push(async () => {
      await cron.stop();
      await site.dispose();
    });
    return clock;
  }

  test("fires a task declared on * * * * * at the minute boundary", async () => {
    const clock = await tickingEveryMinute();

    await clock.advanceTo("2026-10-13T10:01:00Z");

    expect(fired).toEqual(["tick"]);
  });

  test("fires nothing a millisecond before the minute boundary", async () => {
    const clock = await tickingEveryMinute();

    await clock.advanceTo("2026-10-13T10:00:59.999Z");

    expect(fired).toEqual([]);
  });
});

describe("loadEnvFileWhenMain", () => {
  let project: string;
  let cwd: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "plumix-bun-env-"));
    cwd = process.cwd();
    process.chdir(project);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.unstubAllEnvs();
    rmSync(project, { recursive: true, force: true });
  });

  test("fills from .env what the environment left unset, the environment wins, and .env.local is never read", () => {
    writeFileSync(
      join(project, ".env"),
      "PROBE_A=fromfile\nPROBE_B=fromfile\n",
    );
    writeFileSync(join(project, ".env.local"), "PROBE_C=local\n");
    vi.stubEnv("PROBE_A", "platform");
    vi.stubEnv("PROBE_B", undefined);
    vi.stubEnv("PROBE_C", undefined);

    loadEnvFileWhenMain(true);

    expect(process.env).toMatchObject({
      PROBE_A: "platform",
      PROBE_B: "fromfile",
    });
    expect(process.env).not.toHaveProperty("PROBE_C");
  });

  test("with no .env it loads nothing and does not throw", () => {
    vi.stubEnv("PROBE_A", undefined);

    loadEnvFileWhenMain(true);

    expect(process.env).not.toHaveProperty("PROBE_A");
  });
});

const CRON = "*/5 * * * *";

const failing = definePlugin("failing", (ctx) => {
  ctx.registerScheduledTask({
    id: "always-fails",
    cron: CRON,
    handler: () => Promise.reject(new Error("boom")),
  });
});

describe("the site's logs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("a built site writes each log call to stdout as one JSON line, with the error's stack", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const site = createBunSite({
      config: plumix({
        runtime: bun(),
        database: bunSqlite({ path: join(dir, "site.sqlite") }),
        auth,
        theme,
        plugins: [failing],
      }),
      assetManifest: {},
      entryUrl: pathToFileURL(join(dir, "dist/server/worker.js")).href,
    });

    await site.handler.scheduled({
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T03:00:00Z"),
    });
    await site.dispose();

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
          stack: expect.stringContaining("boom") as unknown,
        }) as unknown,
      }),
    );
  });

  test("under dev a site keeps logging to the console, not JSON on stdout", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const site = createBunSite({
      config: plumix({
        runtime: bun(),
        database: bunSqlite({ path: join(dir, "site.sqlite") }),
        auth,
        theme,
        plugins: [failing],
      }),
      assetManifest: {},
      entryUrl: pathToFileURL(join(dir, "dist/server/worker.js")).href,
    });

    await site.handler.scheduled({
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T03:00:00Z"),
    });
    await site.dispose();

    expect(error).toHaveBeenCalledWith(
      `[plumix] scheduled task "failing:always-fails" failed: boom`,
      expect.objectContaining({ taskId: "always-fails", plugin: "failing" }),
    );
    expect(stdout).not.toHaveBeenCalled();
  });
});
