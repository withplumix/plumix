import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { CommandContext } from "plumix";
import type { ViteDevServer } from "vite";
import * as schema from "plumix/schema";
import { applyCoreTestSchema } from "plumix/test";
import { runDevCommand } from "plumix/vite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { loadConfigsFromSource } from "@plumix/vitest-config/source-loader";
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

import { bunSqlite } from "../bun-sqlite.js";
import { bunDevOptions } from "./dev.js";

/** `greeting.mjs` reaches the entry only through the importer walk. */
const config = (dir: string, tagline = "first") =>
  `import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { bun, bunSqlite } from "@plumix/runtime-bun";
import { greeting } from "./greeting.mjs";

const probes = definePlugin("probes", (ctx) => {
  ctx.registerPublicRoute({ path: "/probe/greeting", handler: () => new Response(greeting) });
  ctx.registerPublicRoute({ path: "/probe/tagline", handler: () => new Response(${JSON.stringify(tagline)}) });
  ctx.registerPublicRoute({
    path: "/probe/secret",
    handler: (_request, app) => new Response(String(app.env.PROBE_SECRET ?? "")),
  });
});

export default plumix({
  runtime: bun(),
  database: bunSqlite({ path: ${JSON.stringify(join(dir, "site.sqlite"))} }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
  plugins: [probes],
});
`;

const CONFIG_FILE = "plumix.config.ts";

/**
 * Inside the workspace, so a bare import from the site walks up to the pinned
 * `node_modules`; from the OS temp dir Bun auto-installs the latest from npm.
 */
const SITES = join(import.meta.dirname, "../../.cache/dev-sites");

/**
 * An edit lands on the watcher's schedule, and a restart re-evaluates the
 * config from workspace source: seconds on a fast disk, a minute on a slow one.
 */
const POLL = { timeout: 120_000, interval: 250 };

let dir: string;
let adminDir: string;
let server: ViteDevServer;
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

beforeAll(async () => {
  undoSourceConfigs = loadConfigsFromSource();
  // What `.env` sets lands in this process's env; stubbed so it is restored.
  vi.stubEnv("PROBE_SECRET", undefined);
  vi.stubEnv("PLUMIX_DEV_ALLOW_REMOTE", undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  // The admin shell as `@plumix/admin` builds it, down to the placeholder the
  // staging fills in.
  adminDir = mkdtempSync(join(tmpdir(), "plumix-bun-dev-admin-"));
  writeFileSync(
    join(adminDir, "index.html"),
    '<!doctype html><title>admin</title><body><script id="plumix-manifest" type="application/json">{}</script></body>',
  );

  mkdirSync(SITES, { recursive: true });
  dir = realpathSync(mkdtempSync(join(SITES, "dev-")));
  writeFileSync(join(dir, CONFIG_FILE), config(dir));
  writeFileSync(join(dir, "greeting.mjs"), 'export const greeting = "v1";\n');
  writeFileSync(join(dir, ".env"), "PROBE_SECRET=from-dotenv\n");
  await applyCoreTestSchema(
    bunSqlite({ path: join(dir, "site.sqlite") }).connect(
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
    ...bunDevOptions(dir),
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

describe("plumix dev on the bun runtime", { timeout: 240_000 }, () => {
  test("a value in .env reaches the app's env", async () => {
    const secret = await text("/probe/secret");

    expect(secret).toBe("from-dotenv");
  });

  test("editing a module the config imports changes what the next request serves, without a restart", async () => {
    expect(await text("/probe/greeting")).toBe("v1");

    writeFileSync(join(dir, "greeting.mjs"), 'export const greeting = "v2";\n');

    await expect.poll(() => text("/probe/greeting"), POLL).toBe("v2");
  });

  test("editing the config itself changes what the next request serves", async () => {
    expect(await text("/probe/tagline")).toBe("first");

    writeFileSync(join(dir, CONFIG_FILE), config(dir, "second"));

    await expect.poll(() => text("/probe/tagline"), POLL).toBe("second");
  });
});
