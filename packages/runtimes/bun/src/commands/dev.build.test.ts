import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import {
  CLI_ENV,
  PLUMIX_SCRIPT,
  plumixOn,
  rpc,
  scaffoldConsumerProject,
} from "../test/consumer-project.js";

// `message.mjs` is a module the config imports, so an edit to it reaches the
// entry only through the importer walk; `/runtime` says which runtime the
// site's code runs on; `/secret` reads what `.env` carries; `/tagline` is
// written into the config itself.
const config = (tagline = "first") => `import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { bun, bunSqlite } from "@plumix/runtime-bun";
import { greeting } from "./message.mjs";

const probes = definePlugin("probes", (ctx) => {
  ctx.registerPublicRoute({ path: "/greeting", handler: () => new Response(greeting) });
  ctx.registerPublicRoute({ path: "/tagline", handler: () => new Response(${JSON.stringify(tagline)}) });
  ctx.registerPublicRoute({
    path: "/runtime",
    handler: () => new Response("Bun" in globalThis ? "bun" : "other"),
  });
  ctx.registerPublicRoute({
    path: "/secret",
    handler: (_request, app) => new Response(String(app.env.PROBE_SECRET ?? "")),
  });
});

export default plumix({
  runtime: bun(),
  database: bunSqlite({ path: "data/site.sqlite" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
  plugins: [probes],
});
`;

const CONFIG_FILE = "plumix.config.mjs";

// Vite's watcher throttles change events per path in a 50 ms window and drops
// the later one, so a second write to a file just edited needs a beat.
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

const greeting = (value: string) => `export const greeting = ${value};\n`;

const POLL = { timeout: 30_000, interval: 250 };
const BOOT_TIMEOUT_MS = 120_000;
// eslint-disable-next-line no-control-regex -- escape sequences are the point
const ANSI = /\x1b\[[0-9;]*m/g;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

interface DevServer {
  readonly child: ChildProcess;
  readonly origin: string;
  readonly output: () => string;
  readonly exited: Promise<number | null>;
}

function startDev(dir: string, port: number): Promise<DevServer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "bun",
      [
        "--bun",
        PLUMIX_SCRIPT,
        "dev",
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
      ],
      {
        cwd: dir,
        env: { ...CLI_ENV, PLUMIX_DEV_ALLOW_REMOTE: undefined },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const output = () => `${stdout}\n${stderr}`;
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((done) =>
      child.on("exit", (code) => done(code)),
    );
    const origin = `http://127.0.0.1:${String(port)}`;
    // Bounded, and the failure carries the child's output: a hook timeout
    // would say nothing about what the server was doing.
    const deadline = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `dev server did not listen within ${String(BOOT_TIMEOUT_MS)}ms:\n${output()}`,
        ),
      );
    }, BOOT_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.replace(ANSI, "").includes(`${origin}/`)) {
        clearTimeout(deadline);
        resolve({ child, origin, output, exited });
      }
    });
    child.on("error", reject);
    void exited.then((code) => {
      clearTimeout(deadline);
      reject(
        new Error(
          `dev server exited with ${String(code)} before listening:\n${output()}`,
        ),
      );
    });
  });
}

let dir: string;
let dev: DevServer;

const text = async (path: string) =>
  (await fetch(`${dev.origin}${path}`)).text();

beforeAll(async () => {
  dir = scaffoldConsumerProject("plumix-bun-dev-", config());
  writeFileSync(join(dir, "message.mjs"), greeting('"v1"'));
  // As a scaffolded project has it: Bun loads no env file of its own, so the
  // dev loader is the only reader of `.env`.
  writeFileSync(join(dir, "bunfig.toml"), "env = false\n");
  writeFileSync(join(dir, ".env"), "PROBE_SECRET=from-dotenv\n");
  for (const args of [
    ["migrate", "generate"],
    ["migrate", "apply"],
  ]) {
    expect(await plumixOn("bun", dir, args), args.join(" ")).toMatchObject({
      code: 0,
    });
  }
  dev = await startDev(dir, await freePort());
}, 240_000);

// What the server printed is the only trace of what an edit triggered.
afterEach(({ task }) => {
  if (task.result?.state === "fail") console.log(dev.output());
});

afterAll(async () => {
  dev.child.kill("SIGKILL");
  await dev.exited;
  rmSync(dir, { recursive: true, force: true });
});

describe("bun --bun plumix dev", () => {
  test("serves the home page, the admin shell, the session RPC and a 401 on the entry list, with the site's code on bun", async () => {
    const { origin } = dev;
    const home = await fetch(`${origin}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");

    for (const path of ["/_plumix/admin/", "/_plumix/admin/entries"]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toContain("text/html");
    }

    const session = await rpc(origin, "auth/session");
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      json: { user: null, needsBootstrap: true },
    });
    expect((await rpc(origin, "entry/list")).status).toBe(401);

    expect(await text("/runtime")).toBe("bun");
  }, 60_000);

  test("a value in .env reaches the app's env", async () => {
    expect(await text("/secret")).toBe("from-dotenv");
  });

  test("editing a module the config imports changes what the next request serves, without a restart", async () => {
    expect(await text("/greeting")).toBe("v1");

    writeFileSync(join(dir, "message.mjs"), greeting('"v2"'));

    await expect.poll(() => text("/greeting"), POLL).toBe("v2");
    expect(dev.child.exitCode).toBeNull();
  }, 60_000);

  test("editing the config itself changes what the next request serves, in the same process", async () => {
    expect(await text("/tagline")).toBe("first");
    const pid = dev.child.pid;

    await settle();
    writeFileSync(join(dir, CONFIG_FILE), config("second"));

    await expect.poll(() => text("/tagline"), POLL).toBe("second");
    expect(await text("/greeting")).toBe("v2");
    expect(dev.child.pid).toBe(pid);
    expect(dev.child.exitCode).toBeNull();
  }, 60_000);
});
