import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { CommandContext } from "plumix";
import type { ViteDevServer } from "vite";
import type { MockInstance } from "vitest";
import * as schema from "plumix/schema";
import { applyCoreTestSchema } from "plumix/test";
import { runDevCommand } from "plumix/vite";
import { vi } from "vitest";

import { loadConfigsFromSource } from "@plumix/vitest-config/source-loader";
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

import { nodeDevOptions } from "../commands/dev.js";
import { nodeSqlite } from "../node-sqlite.js";

/**
 * `greeting.mjs` and `dep.mjs` reach the entry only through the importer
 * walk; every database connection the site releases is appended to
 * `closed.log`.
 */
export const siteConfig = (dir: string, plugins = "[probes]") =>
  `import { appendFileSync } from "node:fs";
import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { diskStorage, node, nodeSqlite } from "@plumix/runtime-node";
import { greeting } from "./greeting.mjs";
import { tag } from "./dep.mjs";

const sqlite = nodeSqlite({ path: "data/site.sqlite" });
const database = {
  ...sqlite,
  connect: (...args) => {
    const connection = sqlite.connect(...args);
    return {
      ...connection,
      close: () => {
        appendFileSync(${JSON.stringify(join(dir, "closed.log"))}, "closed\\n");
        connection.close();
      },
    };
  },
};

const probes = definePlugin("probes", { setup: (ctx) => {
  ctx.registerPublicRoute({ path: "/probe/alive", handler: () => new Response("alive") });
  ctx.registerPublicRoute({ path: "/probe/greeting", handler: () => new Response(greeting) });
  ctx.registerPublicRoute({ path: "/probe/dep", handler: () => new Response(tag) });
  ctx.registerPublicRoute({
    path: "/probe/env",
    handler: (request, app) =>
      new Response(String(app.env[new URL(request.url).searchParams.get("key")] ?? "")),
  });
} });

export default plumix({
  runtime: node(),
  database,
  storage: diskStorage({ dir: "data/media" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({
    templates: [fallback(() => null)],
    css: process.env.PROBE_SECRET ? ["./probe.css"] : [],
  }),
  plugins: ${plugins},
});
`;

export const CONFIG_FILE = "plumix.config.ts";

/**
 * An edit lands on the watcher's schedule, and a restart re-evaluates the
 * config from workspace source: seconds on a fast disk, a minute on a slow one.
 */
export const POLL = { timeout: 120_000, interval: 250 };

/** Booting evaluates the config from workspace source twice. */
export const BOOT_TIMEOUT = 300_000;

export interface DevSite {
  readonly dir: string;
  readonly server: ViteDevServer;
  readonly listen: MockInstance<Server["listen"]>;
  /** Read per request: a restart binds a fresh ephemeral port. */
  origin(): string;
  /** Rejects while a restart has the port closed, so a poll keeps polling. */
  text(path: string): Promise<string>;
  /**
   * `fetch` refuses a caller-set `Host`; a raw request carries whatever it is
   * given.
   */
  getWithHost(
    path: string,
    host: string,
  ): Promise<{ status: number; body: string }>;
  closedConnections: () => number;
  close(): Promise<void>;
}

/**
 * `plumix dev` on a scaffold-shaped project in a temp dir, started as the CLI
 * starts it. Each test file boots its own, so files run in parallel.
 */
export async function startDevSite(): Promise<DevSite> {
  const undoSourceConfigs = loadConfigsFromSource();
  // What `.env` sets lands in this process's env; stubbed so it is restored.
  vi.stubEnv("PROBE_SECRET", undefined);
  vi.stubEnv("PROBE_EDITED", undefined);
  vi.stubEnv("PLUMIX_DEV_ALLOW_REMOTE", undefined);
  // Were the entry to serve, it would bind here: a host Vite never takes.
  vi.stubEnv("PORT", "0");
  vi.stubEnv("HOST", "127.0.0.2");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const listen = vi.spyOn(Server.prototype, "listen");
  // The admin shell as `@plumix/admin` builds it, down to the placeholder the
  // staging fills in and the locales its catalogs ship.
  const adminDir = mkdtempSync(join(tmpdir(), "plumix-node-dev-admin-"));
  writeFileSync(
    join(adminDir, "index.html"),
    '<!doctype html><title>admin</title><body><script id="plumix-manifest" type="application/json">{}</script></body>',
  );
  writeFileSync(
    join(adminDir, "catalog-locales.json"),
    JSON.stringify({
      sourceLocale: "en",
      catalogs: { admin: ["en"], editor: ["en"], blocks: ["en"] },
    }),
  );

  const dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-node-dev-")));
  // The cwd a relative `nodeSqlite()` or `diskStorage()` path resolves
  // against, as `plumix dev` run from the project root has it.
  const previousCwd = process.cwd();
  process.chdir(dir);
  // `.ts`, as a scaffolded project has: the config is re-evaluated through
  // jiti's transform, where a native `.mjs` import is cached for the process.
  writeFileSync(join(dir, CONFIG_FILE), siteConfig(dir));
  writeFileSync(join(dir, "greeting.mjs"), 'export const greeting = "v1";\n');
  writeFileSync(join(dir, "dep.mjs"), 'export const tag = "none";\n');
  writeFileSync(join(dir, "closed.log"), "");
  writeFileSync(join(dir, "probe.css"), "body { color: red }\n");
  writeFileSync(join(dir, ".env"), "PROBE_SECRET=from-dotenv\n");
  // Imported by nothing at start, so the scan cannot pre-bundle it.
  const dep = join(dir, "node_modules/my-dep");
  mkdirSync(dep, { recursive: true });
  writeFileSync(join(dep, "package.json"), JSON.stringify({ name: "my-dep" }));
  writeFileSync(join(dep, "index.js"), 'module.exports = { tag: "dep" };\n');
  mkdirSync(join(dir, "data/media/objects/2026/11"), { recursive: true });
  writeFileSync(join(dir, "data/media/objects/2026/11/draft.png"), "draft");
  await applyCoreTestSchema(
    nodeSqlite({ path: join(dir, "data/site.sqlite") }).connect(
      {},
      new Request("http://localhost/"),
      schema,
    ).db,
  );

  const ctx: CommandContext = {
    // `plumix dev` defers the app; nothing here may read it.
    app: {} as CommandContext["app"],
    cwd: dir,
    configPath: join(dir, CONFIG_FILE),
    argv: ["--host", "127.0.0.1"],
  };
  const server = await runDevCommand(ctx, {
    ...nodeDevOptions,
    adminDir,
    vite: {
      plugins: [plumixSourceResolver()],
      server: { port: 0 },
      logLevel: "silent",
    },
  });

  const port = () => (server.httpServer?.address() as AddressInfo).port;
  const origin = () => `http://127.0.0.1:${String(port())}`;
  return {
    dir,
    server,
    listen,
    origin,
    text: async (path) => (await fetch(`${origin()}${path}`)).text(),
    getWithHost: (path, host) =>
      new Promise((resolve, reject) => {
        const req = httpRequest(
          { host: "127.0.0.1", port: port(), path, headers: { host } },
          (res) => {
            let body = "";
            res.on("data", (chunk: Buffer) => (body += chunk.toString()));
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
          },
        );
        req.on("error", reject);
        req.end();
      }),
    closedConnections: () =>
      readFileSync(join(dir, "closed.log"), "utf8").split("\n").filter(Boolean)
        .length,
    async close() {
      await server.close();
      process.chdir(previousCwd);
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      undoSourceConfigs();
      rmSync(dir, { recursive: true, force: true });
      rmSync(adminDir, { recursive: true, force: true });
    },
  };
}
