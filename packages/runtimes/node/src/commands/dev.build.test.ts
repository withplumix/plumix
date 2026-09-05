import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import {
  CLI_ENV,
  PLUMIX_BIN,
  prepareDatabase,
  rpc,
  scaffoldConsumerProject,
} from "../test/consumer-project.js";

// `message.mjs` is a module the config imports, so an edit to it reaches the
// entry only through the importer walk; `/secret` reads what `.env` carries;
// the theme's stylesheet shows whether the emitted sources saw `.env`; a
// duplicated plugin makes `buildApp` reject, for the boot failure.
const config = (plugins = "[probes]") =>
  `import { auth, definePlugin, defineTheme, fallback, plumix } from "plumix";
import { node, nodeSqlite } from "@plumix/runtime-node";
import { greeting } from "./message.mjs";

const probes = definePlugin("probes", (ctx) => {
  ctx.registerPublicRoute({ path: "/greeting", handler: () => new Response(greeting) });
  ctx.registerPublicRoute({
    path: "/secret",
    handler: (_request, app) => new Response(String(app.env.PROBE_SECRET ?? "")),
  });
});

export default plumix({
  runtime: node(),
  database: nodeSqlite({ path: "data/site.sqlite" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({
    templates: [fallback(() => null)],
    css: process.env.PROBE_SECRET ? ["./probe.css"] : [],
  }),
  plugins: ${plugins},
});
`;

const greeting = (value: string) => `export const greeting = ${value};\n`;

const CONFIG_FILE = "plumix.config.ts";

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
  readonly port: number;
  readonly stdout: () => string;
  readonly exited: Promise<number | null>;
}

function startDev(dir: string, port: number): Promise<DevServer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PLUMIX_BIN,
      ["dev", "--port", String(port), "--host", "127.0.0.1"],
      { cwd: dir, env: CLI_ENV, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((done) =>
      child.on("exit", (code) => done(code)),
    );
    const origin = `http://127.0.0.1:${port}`;
    // Bounded, and the failure carries the child's output: a hook timeout
    // would say nothing about what the server was doing.
    const deadline = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `dev server did not listen within ${BOOT_TIMEOUT_MS}ms:\n${stdout}\n${stderr}`,
        ),
      );
    }, BOOT_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // CI keeps colors on, and vite prints the port in bold.
      if (stdout.replace(ANSI, "").includes(`${origin}/`)) {
        clearTimeout(deadline);
        resolve({ child, origin, port, stdout: () => stdout, exited });
      }
    });
    child.on("error", reject);
    void exited.then((code) => {
      clearTimeout(deadline);
      reject(
        new Error(
          `dev server exited with ${code} before listening:\n${stdout}\n${stderr}`,
        ),
      );
    });
  });
}

// `fetch` refuses a caller-set `Host`; a raw request carries whatever it is given.
function getWithHost(
  port: number,
  path: string,
  host: string,
): Promise<{ status: number; body: string }> {
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

let dir: string;
let dev: DevServer;

const text = async (path: string) =>
  (await fetch(`${dev.origin}${path}`)).text();

beforeAll(async () => {
  // `.ts`, as a scaffolded project has: the config is re-evaluated through
  // jiti's transform, where a native `.mjs` import is cached for the process.
  dir = scaffoldConsumerProject("plumix-node-dev-", config(), CONFIG_FILE);
  writeFileSync(join(dir, "message.mjs"), greeting('"v1"'));
  writeFileSync(join(dir, "probe.css"), "body { color: red }\n");
  writeFileSync(join(dir, ".env"), "PROBE_SECRET=from-dotenv\n");
  // Imported by nothing at start, so the scan cannot pre-bundle it.
  const dep = join(dir, "node_modules/my-dep");
  mkdirSync(dep);
  writeFileSync(join(dep, "package.json"), JSON.stringify({ name: "my-dep" }));
  writeFileSync(join(dep, "index.js"), 'module.exports = { tag: "dep" };\n');
  await prepareDatabase(dir);
  dev = await startDev(dir, await freePort());
}, 240_000);

// What the server printed is the only trace of what an edit triggered.
afterEach(({ task }) => {
  if (task.result?.state === "fail") console.log(dev.stdout());
});

afterAll(async () => {
  dev.child.kill("SIGKILL");
  await dev.exited;
  rmSync(dir, { recursive: true, force: true });
});

describe("plumix dev on the node runtime", () => {
  test("serves the home page, the admin shell and a deep link, the session RPC and a 401 on the entry list", async () => {
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
  }, 60_000);

  test("a value in .env reaches the app's env, and the sources the server emitted saw it too", async () => {
    expect(await text("/secret")).toBe("from-dotenv");
    expect(
      readFileSync(join(dir, ".plumix/client-entry.ts"), "utf8"),
    ).toContain("probe.css");
  });

  test("importing the entry through the runner starts no second server", () => {
    expect(dev.stdout()).not.toContain("plumix: listening on");
  });

  test("the plugin's dev error source endpoint still answers", async () => {
    // Reads are confined to vite's fs allowlist, which is under the real path.
    const file = encodeURIComponent(join(realpathSync(dir), CONFIG_FILE));
    const response = await fetch(
      `${dev.origin}/@plumix-dev-error-source?file=${file}&line=1`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ line: 1 });
  });

  test("a request from a non-loopback host is refused before vite serves anything", async () => {
    const path = "/_plumix/admin/";
    expect(
      await getWithHost(dev.port, path, `127.0.0.1:${dev.port}`),
    ).toMatchObject({ status: 200 });
    const refused = await getWithHost(dev.port, path, `10.0.0.5:${dev.port}`);
    expect(refused.status).toBe(403);
    expect(refused.body).not.toContain("<html");
  });

  test("editing a module the config imports changes what the next request serves, without a restart", async () => {
    expect(await text("/greeting")).toBe("v1");

    writeFileSync(join(dir, "message.mjs"), greeting('"v2"'));

    await expect.poll(() => text("/greeting"), POLL).toBe("v2");
  }, 60_000);

  test("a dependency first imported after start is pre-bundled and served", async () => {
    writeFileSync(
      join(dir, "message.mjs"),
      'import { tag } from "my-dep";\n' + greeting('"v3:" + tag'),
    );

    // The first answer that is no longer the old one is already the new
    // module, not an error page from the re-bundle.
    await expect.poll(() => text("/greeting"), POLL).not.toBe("v2");
    expect(await text("/greeting")).toBe("v3:dep");
  }, 60_000);

  test("editing .env is served after the restart it triggers", async () => {
    writeFileSync(join(dir, ".env"), "PROBE_SECRET=edited\n");

    await expect.poll(() => text("/secret"), POLL).toBe("edited");
    expect(await text("/greeting")).toBe("v3:dep");
  }, 60_000);

  test("a boot failure renders the dev boot-error page, and the next good edit recovers", async () => {
    writeFileSync(join(dir, CONFIG_FILE), config("[probes, probes]"));
    await expect
      .poll(() => fetch(`${dev.origin}/`).then((r) => r.status), POLL)
      .toBe(500);
    const page = await fetch(`${dev.origin}/`);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("appears more than once");

    writeFileSync(join(dir, CONFIG_FILE), config());
    await expect.poll(() => text("/greeting"), POLL).toBe("v3:dep");
    expect(dev.child.exitCode).toBeNull();
  }, 90_000);
});
