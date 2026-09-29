import { execFile, spawn } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { plumixOn, scaffoldConsumerProject } from "./test/consumer-project.js";

// Each knob is read off the process env when the built site boots, so one
// build serves every configuration a case needs.
const config = (markers: {
  drained: string;
  aborted: string;
}) => `import { writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { bun, bunSqlite } from "@plumix/runtime-bun";

const knob = (name) => process.env[name] === undefined ? undefined : Number(process.env[name]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const probes = definePlugin("probes", (ctx) => {
  ctx.registerPublicRoute({ path: "/bun-builtin", handler: () => new Response(typeof Database) });
  ctx.registerPublicRoute({
    path: "/whoami",
    handler: (request, app) => Response.json({ url: request.url, address: app.clientAddress ?? null }),
  });
  ctx.registerPublicRoute({
    path: "/slow",
    handler: async (request) => {
      await sleep(Number(new URL(request.url).searchParams.get("ms")));
      return new Response("slow done");
    },
  });
  ctx.registerPublicRoute({
    path: "/events",
    handler: () => {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode("data: first\\n\\n"));
          await sleep(4000);
          controller.enqueue(encoder.encode("data: second\\n\\n"));
          controller.close();
        },
      }), { headers: { "content-type": "text/event-stream" } });
    },
  });
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
    path: "/stream-abort",
    handler: (request) => {
      request.signal.addEventListener("abort", () => writeFileSync(${JSON.stringify(markers.aborted)}, "aborted"));
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first chunk"));
        },
      }));
    },
  });
  ctx.registerPublicRoute({
    path: "/defer-slow",
    handler: (_request, app) => {
      app.defer(sleep(1500).then(() => writeFileSync(${JSON.stringify(markers.drained)}, "drained")));
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
  runtime: bun({
    trustProxy: process.env.PROBE_TRUST === "1",
    idleTimeout: knob("PROBE_IDLE"),
    bodySizeLimit: knob("PROBE_BODY_LIMIT"),
  }),
  database: bunSqlite({ path: "data/site.sqlite" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
  plugins: [probes],
});
`;

interface Started {
  readonly child: ChildProcess;
  readonly origin: string;
  readonly port: number;
  readonly stdout: () => string;
  readonly stderr: () => string;
  readonly exited: Promise<number | null>;
}

// `CI` and `TEST` are cleared: a runtime that shortens or skips its shutdown
// under them would pass here and not in production.
function start(dir: string, env: NodeJS.ProcessEnv = {}): Promise<Started> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["dist/server/worker.js"], {
      cwd: dir,
      env: {
        ...process.env,
        CI: undefined,
        TEST: undefined,
        PORT: "0",
        HOST: "127.0.0.1",
        ...env,
      },
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
      const bound = /listening on (http:\/\/\S+:(\d+))/.exec(stdout);
      if (bound?.[1] && bound[2]) {
        resolve({
          child,
          origin: bound[1],
          port: Number(bound[2]),
          stdout: () => stdout,
          stderr: () => stderr,
          exited,
        });
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
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const started = await start(dir, env);
  try {
    await body(started);
  } finally {
    started.child.kill("SIGKILL");
    await started.exited;
  }
}

/**
 * The TCP ports a process is listening on, read from the kernel rather than
 * from what the process says: each listening socket in the namespace's tables
 * whose inode is one of the process's own descriptors.
 */
function listeningPorts(pid: number): number[] {
  const inodes = new Set<string>();
  for (const fd of readdirSync(`/proc/${String(pid)}/fd`)) {
    try {
      const socket = /^socket:\[(\d+)\]$/.exec(
        readlinkSync(`/proc/${String(pid)}/fd/${fd}`),
      );
      if (socket?.[1]) inodes.add(socket[1]);
    } catch {
      // A descriptor closed between the listing and the read.
    }
  }
  const ports: number[] = [];
  for (const table of ["tcp", "tcp6"]) {
    const rows = readFileSync(`/proc/${String(pid)}/net/${table}`, "utf8")
      .trim()
      .split("\n")
      .slice(1);
    for (const row of rows) {
      const [, local, , state, , , , , , inode] = row.trim().split(/\s+/);
      if (state === "0A" && inode !== undefined && inodes.has(inode)) {
        ports.push(Number.parseInt(local?.split(":").at(-1) ?? "", 16));
      }
    }
  }
  return ports;
}

const rpc = (origin: string, path: string): Promise<Response> =>
  fetch(`${origin}/_plumix/rpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-plumix-request": "1" },
    body: JSON.stringify({ json: {} }),
  });

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

const FORGED = {
  "x-forwarded-proto": "https",
  "x-forwarded-host": "cms.example",
  "x-forwarded-for": "198.51.100.1, 203.0.113.9",
};

let dir: string;
let drained: string;
let aborted: string;

beforeAll(async () => {
  dir = scaffoldConsumerProject("plumix-bun-entry-", "");
  drained = join(dir, "drained.marker");
  aborted = join(dir, "aborted.marker");
  writeFileSync(join(dir, "plumix.config.mjs"), config({ drained, aborted }));
  for (const args of [
    ["migrate", "generate"],
    ["migrate", "apply"],
    ["build"],
  ]) {
    const result = await plumixOn("bun", dir, args);
    expect(result, args.join(" ")).toMatchObject({ code: 0 });
  }
}, 240_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the built site served by bun", () => {
  test("the bundle leaves bun: modules to Bun and resolves without the bun export condition", () => {
    const bundle = readFileSync(join(dir, "dist/server/worker.js"), "utf8");
    expect(bundle).toMatch(/from\s*["']bun:sqlite["']/);
    // React's `bun` build of `react-dom/server` streams through Bun's
    // `type: "direct"` ReadableStream; the default build never does.
    expect(bundle).not.toMatch(/type:\s*"direct"/);
    expect(existsSync(join(dir, "dist/client/_plumix/admin/index.html"))).toBe(
      true,
    );
  });

  test(
    "binds exactly one listener, on the port it was given, and prints it once",
    () =>
      withServer(dir, async ({ child, port, origin, stdout }) => {
        expect(await (await fetch(`${origin}/bun-builtin`)).text()).toBe(
          "function",
        );
        expect(listeningPorts(child.pid ?? 0)).toEqual([port]);
        expect(port).not.toBe(3000);
        expect(stdout().match(/listening on/g)).toHaveLength(1);
      }),
    60_000,
  );

  test(
    "answers the home page, the admin shell, the session RPC and a 401 on the entry list",
    () =>
      withServer(dir, async ({ origin }) => {
        const home = await fetch(`${origin}/`);
        expect(home.status).toBe(200);
        expect(home.headers.get("content-type")).toContain("text/html");

        const shell = await fetch(`${origin}/_plumix/admin/`);
        expect(shell.status).toBe(200);
        expect(shell.headers.get("content-type")).toContain("text/html");

        const session = await rpc(origin, "auth/session");
        expect(session.status).toBe(200);
        expect(await session.json()).toMatchObject({
          json: { user: null, needsBootstrap: true },
        });
        expect((await rpc(origin, "entry/list")).status).toBe(401);
      }),
    60_000,
  );

  test(
    "serves a hashed asset immutable, resolves an admin deep link through the assets binding, and hands an unknown path to the handler",
    () =>
      withServer(dir, async ({ origin }) => {
        const assets = readdirSync(join(dir, "dist/client/assets"));
        const chunk = assets.find((name) => name.endsWith(".js"));
        expect(chunk).toBeDefined();
        const hashed = await fetch(`${origin}/assets/${chunk ?? ""}`);
        expect(hashed.status).toBe(200);
        expect(hashed.headers.get("cache-control")).toBe(
          "public, max-age=31536000, immutable",
        );

        const deepLink = await fetch(`${origin}/_plumix/admin/entries/new`);
        expect(deepLink.status).toBe(200);
        expect(await deepLink.text()).toContain(
          '<base href="/_plumix/admin/">',
        );

        const unknown = await fetch(`${origin}/whoami`);
        expect(unknown.status).toBe(200);
        expect(await unknown.json()).toMatchObject({ address: "127.0.0.1" });
      }),
    60_000,
  );

  test(
    "with trustProxy off, forged forwarded headers are ignored",
    () =>
      withServer(dir, async ({ origin }) => {
        const response = await fetch(`${origin}/whoami`, { headers: FORGED });
        expect(await response.json()).toEqual({
          url: `${origin}/whoami`,
          address: "127.0.0.1",
        });
      }),
    60_000,
  );

  test(
    "with trustProxy on, the forwarded scheme, host and address are honoured",
    () =>
      withServer(
        dir,
        async ({ origin }) => {
          const response = await fetch(`${origin}/whoami`, {
            headers: FORGED,
          });
          expect(await response.json()).toEqual({
            url: "https://cms.example/whoami",
            address: "203.0.113.9",
          });
        },
        { PROBE_TRUST: "1" },
      ),
    60_000,
  );

  test(
    "delivers each cookie a response sets as its own Set-Cookie header",
    () =>
      withServer(dir, async ({ origin }) => {
        const response = await fetch(`${origin}/cookies`);
        expect(response.headers.getSetCookie()).toEqual([
          "first=1; Path=/; HttpOnly",
          "second=2; Path=/; HttpOnly",
        ]);
      }),
    60_000,
  );

  test(
    "a client disconnecting mid-stream aborts the request's signal",
    () =>
      withServer(dir, async ({ origin }) => {
        await new Promise<void>((resolve, reject) => {
          const req = httpRequest(`${origin}/stream-abort`, (res) => {
            res.once("data", () => {
              req.destroy();
              resolve();
            });
          });
          req.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code !== "ECONNRESET") reject(error);
          });
          req.end();
        });
        expect(await waitFor(() => existsSync(aborted), 5_000)).toBe(true);
      }),
    60_000,
  );

  test(
    "answers an oversize body with 413, and takes one under the limit",
    () =>
      withServer(
        dir,
        async ({ origin }) => {
          const oversize = await fetch(`${origin}/whoami`, {
            method: "POST",
            body: "x".repeat(2048),
          });
          expect(oversize.status).toBe(413);
          const under = await fetch(`${origin}/whoami`, {
            method: "POST",
            body: "x".repeat(512),
          });
          expect(under.status).not.toBe(413);
        },
        { PROBE_BODY_LIMIT: "1024" },
      ),
    60_000,
  );

  test(
    "a short idle timeout cuts a pending response but not an event stream",
    () =>
      withServer(
        dir,
        async ({ origin }) => {
          await expect(fetch(`${origin}/slow?ms=4000`)).rejects.toThrow();

          const events = await fetch(`${origin}/events`);
          expect(await events.text()).toBe("data: first\n\ndata: second\n\n");
        },
        { PROBE_IDLE: "2" },
      ),
    60_000,
  );

  // Run side by side: Bun's own default would cut the first at 10 s, and the
  // default of 30 the second.
  test("a handler slower than 10 s completes, and idleTimeout 0 lets one outlast 30 s", async () => {
    await Promise.all([
      withServer(dir, async ({ origin }) => {
        const response = await fetch(`${origin}/slow?ms=11000`);
        expect(await response.text()).toBe("slow done");
      }),
      withServer(
        dir,
        async ({ origin }) => {
          const response = await fetch(`${origin}/slow?ms=31000`);
          expect(await response.text()).toBe("slow done");
        },
        { PROBE_IDLE: "0" },
      ),
    ]);
  }, 90_000);

  test(
    "SIGTERM lets an in-flight response finish, drains deferred work and exits 0",
    () =>
      withServer(dir, async ({ child, origin, exited }) => {
        expect(await (await fetch(`${origin}/defer-slow`)).text()).toBe("slow");
        const pending = fetch(`${origin}/slow?ms=1000`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        child.kill("SIGTERM");

        expect(await (await pending).text()).toBe("slow done");
        expect(await exited).toBe(0);
        expect(readFileSync(drained, "utf8")).toBe("drained");
      }),
    60_000,
  );

  test(
    "at the deadline it cuts what is still running and exits 1, naming it",
    () =>
      withServer(dir, async ({ child, origin, stderr, exited }) => {
        expect(await (await fetch(`${origin}/defer-stuck`)).text()).toBe(
          "stuck",
        );
        const stuck = fetch(`${origin}/slow?ms=60000`).catch(() => "cut");
        await new Promise((resolve) => setTimeout(resolve, 200));
        const began = Date.now();
        child.kill("SIGTERM");

        expect(await exited).toBe(1);
        expect(Date.now() - began).toBeLessThan(15_000);
        expect(await stuck).toBe("cut");
        expect(stderr()).toContain("in-flight responses cut");
        expect(stderr()).toContain("1 deferred task(s) abandoned");
      }),
    60_000,
  );

  test(
    "a second signal exits at once",
    () =>
      withServer(dir, async ({ child, origin, exited }) => {
        await fetch(`${origin}/defer-stuck`);
        child.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 300));
        const began = Date.now();
        child.kill("SIGTERM");

        expect(await exited).not.toBe(0);
        expect(Date.now() - began).toBeLessThan(2_000);
      }),
    60_000,
  );

  test("importing the entry exports the portable handler and starts no server", async () => {
    const worker = pathToFileURL(join(dir, "dist/server/worker.js")).href;
    const { stdout } = await promisify(execFile)(
      "bun",
      [
        "-e",
        `const m = await import(${JSON.stringify(worker)}); console.log(typeof m.default.fetch, typeof m.default.scheduled);`,
      ],
      { cwd: dir, env: { ...process.env, PORT: "0" }, timeout: 30_000 },
    );
    expect(stdout.trim()).toBe("function function");
    expect(stdout).not.toContain("listening");
  }, 60_000);
});
