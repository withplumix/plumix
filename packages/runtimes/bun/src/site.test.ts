import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import { createBunSite, serveProcess } from "./site.js";

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

/**
 * The site's serve options on a real `Bun.serve`, so the address and the URL
 * are what Bun hands a request from a real socket.
 */
async function served(
  config: BunConfig,
  body: (origin: string) => Promise<void>,
): Promise<void> {
  const site = createBunSite({
    config: plumix({
      runtime: bun(config),
      database: bunSqlite({ path: join(dir, "site.sqlite") }),
      auth,
      theme,
      plugins: [echo],
    }),
    assetManifest: {},
    entryUrl: pathToFileURL(join(dir, "dist/server/worker.js")).href,
  });
  const server = Bun.serve({ ...site.serve, port: 0, hostname: "127.0.0.1" });
  try {
    await body(`http://127.0.0.1:${String(server.port)}`);
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
});
