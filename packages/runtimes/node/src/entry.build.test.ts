import { execFile, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  CLI_ENV,
  PACKAGE_ROOT,
  PLUMIX_BIN,
  prepareDatabase,
  rpc,
  scaffoldConsumerProject,
} from "./test/consumer-project.js";

const run = promisify(execFile);

// A 1×1 red PNG: enough for the image route to decode and re-encode.
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// `my-native` stands in for a compiled addon the site declares external; the
// probe routes give the shutdown cases in-flight and deferred work to observe.
const config = (marker: string) => `import { writeFileSync } from "node:fs";
import { auth, definePlugin, defineTheme, fallback, plumix } from "plumix";
import { images, node, nodeSqlite } from "@plumix/runtime-node";
import { tag } from "my-native";

const probes = definePlugin("probes", (ctx) => {
  ctx.registerPublicRoute({ path: "/native", handler: () => new Response(tag) });
  ctx.registerPublicRoute({
    path: "/pixel.png",
    handler: () => new Response(Buffer.from(${JSON.stringify(PIXEL)}, "base64"), { headers: { "content-type": "image/png" } }),
  });
  ctx.registerPublicRoute({
    path: "/secret",
    handler: (_request, app) => new Response(String(app.env.PROBE_SECRET ?? "")),
  });
  ctx.registerPublicRoute({
    path: "/slow-response",
    handler: () => new Promise((resolve) => setTimeout(() => resolve(new Response("slow response")), 1000)),
  });
  ctx.registerPublicRoute({
    path: "/defer-slow",
    handler: (_request, app) => {
      app.defer(new Promise((resolve) => setTimeout(() => {
        writeFileSync(${JSON.stringify(marker)}, "drained");
        resolve();
      }, 1500)));
      return new Response("slow");
    },
  });
  ctx.registerPublicRoute({
    path: "/defer-stuck",
    handler: (_request, app) => {
      app.defer(new Promise(() => {}));
      return new Response("stuck");
    },
  });
});

export default plumix({
  runtime: node({ build: { external: ["my-native"] } }),
  database: nodeSqlite({ path: "data/site.sqlite" }),
  imageDelivery: images({ cacheDir: "data/images" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
  plugins: [probes],
});
`;

interface Started {
  readonly child: ChildProcess;
  readonly origin: string;
  readonly stderr: () => string;
  readonly exited: Promise<number | null>;
}

function start(dir: string): Promise<Started> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/server/worker.js"], {
      cwd: dir,
      env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((done) =>
      child.on("exit", (code) => done(code)),
    );
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const bound = /listening on (http:\/\/\S+)/.exec(stdout);
      if (bound?.[1]) {
        resolve({ child, origin: bound[1], stderr: () => stderr, exited });
      }
    });
    child.on("error", reject);
    void exited.then((code) => {
      if (!stdout.includes("listening")) {
        reject(
          new Error(`server exited with ${code} before listening:\n${stderr}`),
        );
      }
    });
  });
}

// SIGKILL after the case so a hung drain cannot outlive vitest; a no-op once
// the process has exited on its own.
async function withServer(
  dir: string,
  body: (started: Started) => Promise<void>,
): Promise<void> {
  const started = await start(dir);
  try {
    await body(started);
  } finally {
    started.child.kill("SIGKILL");
    await started.exited;
  }
}

let dir: string;
let marker: string;

beforeAll(async () => {
  dir = scaffoldConsumerProject("plumix-node-entry-", "");
  marker = join(dir, "drained.marker");
  writeFileSync(join(dir, "plumix.config.mjs"), config(marker));
  // Only `plumix dev` reads this; the built entry must not.
  writeFileSync(join(dir, ".env"), "PROBE_SECRET=from-dotenv\n");
  const native = join(dir, "node_modules/my-native");
  mkdirSync(native);
  writeFileSync(
    join(native, "package.json"),
    JSON.stringify({
      name: "my-native",
      type: "module",
      exports: "./index.js",
    }),
  );
  writeFileSync(join(native, "index.js"), 'export const tag = "native";\n');
  // The optional peer, installed the way an app installs it: beside the
  // runtime, where the bundle's `require("sharp")` resolves from.
  symlinkSync(
    realpathSync(join(PACKAGE_ROOT, "node_modules/sharp")),
    join(dir, "node_modules/sharp"),
  );
  await prepareDatabase(dir);
  await run(PLUMIX_BIN, ["build"], { cwd: dir, env: CLI_ENV });
}, 240_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the built site served by node", () => {
  test("the bundle inlines the site, leaves the declared native package external, and copies no public files", () => {
    const bundle = readFileSync(join(dir, "dist/server/worker.js"), "utf8");
    expect(bundle).toMatch(/from\s*["']my-native["']/);
    expect(bundle).not.toContain('tag = "native"');
    expect(existsSync(join(dir, "dist/client/_plumix/admin/index.html"))).toBe(
      true,
    );
    expect(existsSync(join(dir, "dist/server/_plumix"))).toBe(false);
  });

  test(
    "answers the home page, the admin shell and a deep link, and the RPCs",
    () =>
      withServer(dir, async ({ origin }) => {
        const home = await fetch(`${origin}/`);
        expect(home.status).toBe(200);
        expect(home.headers.get("content-type")).toContain("text/html");

        for (const path of ["/_plumix/admin/", "/_plumix/admin/entries"]) {
          const response = await fetch(`${origin}${path}`);
          expect(response.status, path).toBe(200);
          expect(response.headers.get("content-type"), path).toContain(
            "text/html",
          );
        }

        const session = await rpc(origin, "auth/session");
        expect(session.status).toBe(200);
        expect(await session.json()).toMatchObject({
          json: { user: null, needsBootstrap: true },
        });
        expect((await rpc(origin, "entry/list")).status).toBe(401);
        expect(await (await fetch(`${origin}/native`)).text()).toBe("native");
      }),
    60_000,
  );

  test(
    "serves an image transform ahead of the site, resolving the source through it, and answers 304 on revalidation",
    () =>
      withServer(dir, async ({ origin }) => {
        const query = "/_plumix/image?src=/pixel.png&w=320";
        const first = await fetch(`${origin}${query}`, {
          headers: { accept: "image/webp,*/*" },
        });
        expect(first.status).toBe(200);
        expect(first.headers.get("content-type")).toBe("image/webp");
        expect(first.headers.get("cache-control")).toContain("immutable");
        expect(existsSync(join(dir, "data/images"))).toBe(true);

        const again = await fetch(`${origin}${query}`, {
          headers: {
            accept: "image/webp,*/*",
            "if-none-match": first.headers.get("etag") ?? "",
          },
        });
        expect(again.status).toBe(304);
        // Gating travels with the source: a path the site does not hold.
        const missing = await fetch(
          `${origin}/_plumix/image?src=/nope.png&w=320`,
        );
        expect(missing.status).toBe(404);
      }),
    60_000,
  );

  test(
    "production loads no .env file: a value only that file carries is absent",
    () =>
      withServer(dir, async ({ origin }) => {
        expect(await (await fetch(`${origin}/secret`)).text()).toBe("");
      }),
    60_000,
  );

  test(
    "SIGTERM lets an in-flight response finish and exits 0",
    () =>
      withServer(dir, async ({ child, origin, exited }) => {
        const pending = fetch(`${origin}/slow-response`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        child.kill("SIGTERM");

        expect(await (await pending).text()).toBe("slow response");
        expect(await exited).toBe(0);
      }),
    60_000,
  );

  test(
    "SIGTERM drains pending deferred work and exits 0",
    () =>
      withServer(dir, async ({ child, origin, exited }) => {
        expect(await (await fetch(`${origin}/defer-slow`)).text()).toBe("slow");
        const began = Date.now();
        child.kill("SIGTERM");

        expect(await exited).toBe(0);
        expect(Date.now() - began).toBeLessThan(10_000);
        expect(readFileSync(marker, "utf8")).toBe("drained");
      }),
    60_000,
  );

  test(
    "a stuck task hits the deadline and the process exits 1 naming it",
    () =>
      withServer(dir, async ({ child, origin, stderr, exited }) => {
        expect(await (await fetch(`${origin}/defer-stuck`)).text()).toBe(
          "stuck",
        );
        child.kill("SIGTERM");

        expect(await exited).toBe(1);
        expect(stderr()).toContain("1 deferred task(s) abandoned");
      }),
    60_000,
  );

  test("importing the entry does not start a server", async () => {
    const worker = pathToFileURL(join(dir, "dist/server/worker.js")).href;
    const { stdout } = await run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(worker)}); console.log(typeof m.default.fetch, typeof m.listener);`,
      ],
      { cwd: dir, env: { ...process.env, PORT: "0" }, timeout: 30_000 },
    );
    expect(stdout.trim()).toBe("function function");
    expect(stdout).not.toContain("listening");
  }, 60_000);
});
