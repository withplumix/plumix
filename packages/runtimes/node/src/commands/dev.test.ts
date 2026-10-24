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
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import type { CommandContext } from "plumix";
import type { ViteDevServer } from "vite";
import type { MockInstance } from "vitest";
import * as schema from "plumix/schema";
import { applyCoreTestSchema } from "plumix/test";
import { runDevCommand } from "plumix/vite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { loadConfigsFromSource } from "@plumix/vitest-config/source-loader";
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

import { nodeSqlite } from "../node-sqlite.js";
import { nodeDevOptions } from "./dev.js";

/**
 * `greeting.mjs` and `dep.mjs` reach the entry only through the importer
 * walk; every database connection the site releases is appended to
 * `closed.log`.
 */
const config = (dir: string, plugins = "[probes]") =>
  `import { appendFileSync } from "node:fs";
import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { node, nodeSqlite } from "@plumix/runtime-node";
import { greeting } from "./greeting.mjs";
import { tag } from "./dep.mjs";

const sqlite = nodeSqlite({ path: ${JSON.stringify(join(dir, "site.sqlite"))} });
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
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({
    templates: [fallback(() => null)],
    css: process.env.PROBE_SECRET ? ["./probe.css"] : [],
  }),
  plugins: ${plugins},
});
`;

const CONFIG_FILE = "plumix.config.ts";

/**
 * An edit lands on the watcher's schedule, and a restart re-evaluates the
 * config from workspace source: seconds on a fast disk, a minute on a slow one.
 */
const POLL = { timeout: 120_000, interval: 250 };

let dir: string;
let adminDir: string;
let server: ViteDevServer;
let listen: MockInstance<Server["listen"]>;
let undoSourceConfigs: () => void;

/** Read per request: a restart binds a fresh ephemeral port. */
function origin(): string {
  const { port } = server.httpServer?.address() as AddressInfo;
  return `http://127.0.0.1:${String(port)}`;
}

/** Rejects while a restart has the port closed, so a poll keeps polling. */
async function text(path: string): Promise<string> {
  return (await fetch(`${origin()}${path}`)).text();
}

/**
 * `fetch` refuses a caller-set `Host`; a raw request carries whatever it is
 * given.
 */
function getWithHost(
  path: string,
  host: string,
): Promise<{ status: number; body: string }> {
  const { port } = server.httpServer?.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, headers: { host } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const closedConnections = () =>
  readFileSync(join(dir, "closed.log"), "utf8").split("\n").filter(Boolean)
    .length;

beforeAll(async () => {
  undoSourceConfigs = loadConfigsFromSource();
  // What `.env` sets lands in this process's env; stubbed so it is restored.
  vi.stubEnv("PROBE_SECRET", undefined);
  vi.stubEnv("PROBE_EDITED", undefined);
  vi.stubEnv("PLUMIX_DEV_ALLOW_REMOTE", undefined);
  // Were the entry to serve, it would bind here: a host Vite never takes.
  vi.stubEnv("PORT", "0");
  vi.stubEnv("HOST", "127.0.0.2");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  listen = vi.spyOn(Server.prototype, "listen");
  // The admin shell as `@plumix/admin` builds it, down to the placeholder the
  // staging fills in.
  adminDir = mkdtempSync(join(tmpdir(), "plumix-node-dev-admin-"));
  writeFileSync(
    join(adminDir, "index.html"),
    '<!doctype html><title>admin</title><body><script id="plumix-manifest" type="application/json">{}</script></body>',
  );

  dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-node-dev-")));
  // `.ts`, as a scaffolded project has: the config is re-evaluated through
  // jiti's transform, where a native `.mjs` import is cached for the process.
  writeFileSync(join(dir, CONFIG_FILE), config(dir));
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
  await applyCoreTestSchema(
    nodeSqlite({ path: join(dir, "site.sqlite") }).connect(
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
  server = await runDevCommand(ctx, {
    ...nodeDevOptions,
    adminDir,
    vite: {
      plugins: [plumixSourceResolver()],
      server: { port: 0 },
      logLevel: "silent",
    },
  });
}, 300_000);

afterAll(async () => {
  await server.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  undoSourceConfigs();
  rmSync(dir, { recursive: true, force: true });
  rmSync(adminDir, { recursive: true, force: true });
});

describe("plumix dev on the node runtime", { timeout: 240_000 }, () => {
  test("a value in .env reaches the app's env, and the sources the server emitted saw it too", async () => {
    const secret = await text("/probe/env?key=PROBE_SECRET");

    expect(secret).toBe("from-dotenv");
    expect(
      readFileSync(join(dir, ".plumix/client-entry.ts"), "utf8"),
    ).toContain("probe.css");
  });

  test("a staged admin asset Vite's public middleware declines is still served", async () => {
    const asset = "/_plumix/admin/assets/probe-staged.js";
    const staged = join(dir, ".plumix/public", asset);
    mkdirSync(dirname(staged), { recursive: true });
    writeFileSync(staged, "export const probe = 1;\n");

    // Vite's publicDir listing can miss a file staged after createServer and
    // 404 it; `?url` makes Vite decline by construction, without the race.
    const response = await fetch(`${origin()}${asset}?url`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("export const probe");
  });

  test("importing the generated entry through the runner opens no listener of its own", async () => {
    const served = await text("/probe/alive");

    expect(served).toBe("alive");
    expect(listen.mock.calls.flat()).not.toContain("127.0.0.2");
  });

  test("the plugin's dev error source endpoint answers", async () => {
    const file = encodeURIComponent(join(dir, CONFIG_FILE));

    const response = await fetch(
      `${origin()}/@plumix-dev-error-source?file=${file}&line=1`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ line: 1 });
  });

  test("a request from a loopback host is served", async () => {
    const { port } = server.httpServer?.address() as AddressInfo;

    const served = await getWithHost("/@vite/client", `127.0.0.1:${port}`);

    expect(served.status).toBe(200);
  });

  test("a request from a non-loopback host is refused before Vite serves anything", async () => {
    const { port } = server.httpServer?.address() as AddressInfo;

    const refused = await getWithHost("/@vite/client", `10.0.0.5:${port}`);

    expect(refused.status).toBe(403);
    expect(refused.body).not.toContain("import");
  });

  test("editing a module the config imports changes what the next request serves, without a restart, and releases the replaced site's connections", async () => {
    expect(await text("/probe/greeting")).toBe("v1");
    const released = closedConnections();

    writeFileSync(join(dir, "greeting.mjs"), 'export const greeting = "v2";\n');

    await expect.poll(() => text("/probe/greeting"), POLL).toBe("v2");
    // The replaced site's handler connection, and its scheduler's.
    await expect
      .poll(closedConnections, POLL)
      .toBeGreaterThanOrEqual(released + 2);
  });

  test("a dependency first imported after start is pre-bundled and served", async () => {
    expect(await text("/probe/dep")).toBe("none");

    writeFileSync(
      join(dir, "dep.mjs"),
      'import { tag as depTag } from "my-dep";\nexport const tag = depTag;\n',
    );

    // The first answer that is no longer the old one is already the new
    // module, not an error page from the re-bundle.
    await expect.poll(() => text("/probe/dep"), POLL).not.toBe("none");
    expect(await text("/probe/dep")).toBe("dep");
  });

  test("editing .env is served after the restart it triggers", async () => {
    writeFileSync(
      join(dir, ".env"),
      "PROBE_SECRET=from-dotenv\nPROBE_EDITED=edited\n",
    );

    await expect
      .poll(() => text("/probe/env?key=PROBE_EDITED"), POLL)
      .toBe("edited");
  });

  test("a boot failure renders the dev boot-error page, and the next good edit recovers", async () => {
    writeFileSync(join(dir, CONFIG_FILE), config(dir, "[probes, probes]"));
    await expect
      .poll(() => fetch(`${origin()}/`).then((r) => r.status), POLL)
      .toBe(500);
    const page = await fetch(`${origin()}/`);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("appears more than once");

    writeFileSync(join(dir, CONFIG_FILE), config(dir));

    await expect.poll(() => text("/probe/alive"), POLL).toBe("alive");
  });
});
