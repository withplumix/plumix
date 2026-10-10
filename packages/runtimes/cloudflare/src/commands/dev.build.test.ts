import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OWN_MODULES = join(PACKAGE_ROOT, "node_modules");
const PLUMIX_BIN = join(OWN_MODULES, ".bin/plumix");

/**
 * `NODE_PATH` is `pnpm exec`'s hoisted store, through which the fixture would
 * resolve packages it never installed; an app root has no such path.
 */
const CLI_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_OPTIONS: undefined,
  NODE_PATH: undefined,
};

const BOOT_TIMEOUT_MS = 120_000;
// eslint-disable-next-line no-control-regex -- escape sequences are the point
const ANSI = /\x1b\[[0-9;]*m/g;

const CONFIG = `import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { cloudflare, d1 } from "@plumix/runtime-cloudflare";

const probes = definePlugin("probes", (ctx) => {
  ctx.registerPublicRoute({
    path: "/secret",
    handler: (_request, app) => new Response(String(app.env.PROBE_SECRET ?? "")),
  });
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:5173" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
  plugins: [probes],
});
`;

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

function startDev(
  dir: string,
): Promise<{ child: ChildProcess; origin: string }> {
  return Promise.all([freePort(), freePort()]).then(
    ([port, inspectorPort]) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          PLUMIX_BIN,
          [
            "dev",
            "--port",
            String(port),
            "--inspector-port",
            String(inspectorPort),
          ],
          { cwd: dir, env: CLI_ENV, stdio: ["ignore", "pipe", "pipe"] },
        );
        let stdout = "";
        let stderr = "";
        child.stderr.on(
          "data",
          (chunk: Buffer) => (stderr += chunk.toString()),
        );
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
          const bound = /(http:\/\/localhost:\d+)\//.exec(
            stdout.replace(ANSI, ""),
          );
          if (bound?.[1]) {
            clearTimeout(deadline);
            resolve({ child, origin: bound[1] });
          }
        });
        child.on("error", reject);
        child.on("exit", (code) => {
          clearTimeout(deadline);
          reject(
            new Error(`dev server exited with ${code}:\n${stdout}\n${stderr}`),
          );
        });
      }),
  );
}

/**
 * Vite binds `localhost` to whichever address the child's resolver lists
 * first, which need not be the one this process's `fetch` dials.
 */
async function fetchLocal(origin: string, path: string): Promise<string> {
  const { port } = new URL(origin);
  let refused: unknown;
  for (const host of ["[::1]", "127.0.0.1"]) {
    try {
      return await (await fetch(`http://${host}:${port}${path}`)).text();
    } catch (error) {
      refused = error;
    }
  }
  throw refused;
}

let dir: string;
let dev: ChildProcess | undefined;

// The project a fresh scaffold writes: this package's own `wrangler.jsonc`
// template, and local secrets in `.env`.
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-cloudflare-dev-"));
  const modules = join(dir, "node_modules");
  mkdirSync(join(modules, "@plumix"), { recursive: true });
  symlinkSync(
    realpathSync(join(OWN_MODULES, "plumix")),
    join(modules, "plumix"),
  );
  symlinkSync(PACKAGE_ROOT, join(modules, "@plumix/runtime-cloudflare"));
  symlinkSync(join(OWN_MODULES, ".bin"), join(modules, ".bin"));
  writeFileSync(join(dir, "plumix.config.mjs"), CONFIG);
  writeFileSync(
    join(dir, "wrangler.jsonc"),
    readFileSync(
      join(PACKAGE_ROOT, "scaffold/wrangler.jsonc"),
      "utf8",
    ).replaceAll("__PROJECT_NAME__", "env-probe"),
  );
  writeFileSync(join(dir, ".env"), "PROBE_SECRET=from-dotenv\n");
});

afterAll(() => {
  dev?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

test(
  "plumix dev reads a secret from .env into the Worker env",
  async () => {
    const started = await startDev(dir);
    dev = started.child;

    expect(await fetchLocal(started.origin, "/secret")).toBe("from-dotenv");
  },
  BOOT_TIMEOUT_MS,
);
