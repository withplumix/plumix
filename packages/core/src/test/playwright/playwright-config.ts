import { resolve } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";

import type { RuntimeE2E } from "./runtime-e2e.js";
import type { PlumixWorkerOptions } from "./test.js";
import { readRuntimeE2E } from "./runtime-e2e.js";

export interface PlumixE2EConfigOptions {
  /**
   * Base port for the worker / preview; derives `baseURL` and is passed to
   * `plumix dev --port`. Pick distinct ports per suite. Shifted by
   * `PLUMIX_E2E_PORT_OFFSET`. Defaults to `5173`.
   */
  readonly port?: number;
  /**
   * Workerd inspector port for `plumix dev --inspector-port`; the
   * auto-allocated default collides across parallel suites. Convention: mirror
   * the HTTP port (3010 ↔ 9310). Shifted like `port`.
   */
  readonly inspectorPort?: number;
  /**
   * Directory of the playwright config file — pass `import.meta.dirname`.
   * `playground` is resolved against it to read the runtime's `plumix.e2e`
   * block at config time. Required with `playground`.
   */
  readonly configDir?: string;
  /**
   * Playground workspace relative to `configDir`. Bakes the webServer (`plumix
   * migrate fresh` then `plumix dev`) and wires `globalSetup.ts` /
   * `storageState.json`. Excludes `webServerCommand`.
   */
  readonly playground?: string;
  /**
   * Whether specs share the playground's one database (default `true`): pins
   * one worker and enables the `plumixDbBaseline` fixture. Set `false` for e.g.
   * per-session databases.
   */
  readonly sharedDatabase?: boolean;
  /** Directory passed through to playwright's `testDir`. Defaults to `'.'`. */
  readonly testDir?: string;
  /**
   * Base URL the spec navigates against. Defaults to
   * `http://localhost:<port>/_plumix/admin/`.
   */
  readonly baseURL?: string;
  /**
   * Shell command(s) run before the suite — typically build + preview.
   * Required when `playground` is not set; rejected when it is.
   */
  readonly webServerCommand?: string;
  /**
   * Wait for this TCP port instead of polling a URL, for a dev server whose `/`
   * 404s. Pass the same base as `port`; it's shifted by the offset too.
   */
  readonly webServerPort?: number;
  /**
   * Shell step run after `plumix migrate fresh` and before `plumix dev`, for
   * seeds the server needs at boot. Only meaningful with `playground`.
   */
  readonly extraSetup?: string;
  /**
   * Pass `false` to skip the `globalSetup.ts` / `storageState.json`
   * admin-session wiring, e.g. for public-route specs.
   */
  readonly seedAdminSession?: boolean;
}

const ADMIN_BASE = "/_plumix/admin";
const READINESS_PATH = "/_plumix/auth/magic-link/verify";
const PORT_OFFSET_ENV = "PLUMIX_E2E_PORT_OFFSET";
const DEFAULT_PORT = 5173;

/**
 * Shifts a base port by `PLUMIX_E2E_PORT_OFFSET`, moving every port equally so
 * suite spacing holds. Exported for admin suites that build their own `vite
 * preview` commands.
 */
export function resolveE2EPort(base: number): number {
  const raw = process.env[PORT_OFFSET_ENV];
  if (raw === undefined || raw.trim() === "") return base;
  const offset = Number(raw);
  if (!Number.isInteger(offset)) {
    throw new Error(
      `${PORT_OFFSET_ENV} must be an integer, got ${JSON.stringify(raw)}.`,
    );
  }
  return base + offset;
}

/**
 * Playwright holds the only writer of the child's stdin, so the pipe closes
 * however the runner dies, and the process group, port and all, goes with it.
 */
const SUPERVISOR = [
  `const { spawn } = require("node:child_process");`,
  `const server = spawn(process.argv[1], { shell: true, stdio: ["ignore", "inherit", "inherit"] });`,
  `server.on("exit", (code) => process.exit(code ?? 1));`,
  `process.stdin.on("end", () => process.kill(0, "SIGKILL"));`,
  `process.stdin.resume();`,
].join(" ");

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

/** `command` wrapped so it stops when the Playwright runner does. */
export function superviseWebServer(command: string): string {
  return [process.execPath, "-e", SUPERVISOR, command]
    .map(shellQuote)
    .join(" ");
}

interface PlaygroundCommand {
  readonly playground: string;
  /** Runs each `plumix` step; the runtime's `cli`, else `pnpm exec plumix`. */
  readonly cli: string;
  readonly port: number;
  readonly inspectorPort: number | undefined;
  readonly extraSetup: string | undefined;
}

function bakePlaygroundCommand(input: PlaygroundCommand): string {
  const steps = [
    `cd ${input.playground}`,
    // Deletes only the local state the runtime's `plumix.e2e.wipe` names, then
    // applies every owner's shipped history: nothing is generated, so a
    // site's committed history is never touched (#2819).
    `${input.cli} migrate fresh`,
  ];
  if (input.extraSetup) steps.push(input.extraSetup);
  const devFlags = [`--port ${String(input.port)}`];
  if (input.inspectorPort !== undefined) {
    devFlags.push(`--inspector-port ${String(input.inspectorPort)}`);
  }
  steps.push(`${input.cli} dev ${devFlags.join(" ")}`);
  return steps.join(" && ");
}

function playgroundRuntime(
  configDir: string | undefined,
  playground: string,
): RuntimeE2E {
  if (configDir === undefined) {
    throw new Error(
      "definePlumixE2EConfig: `playground` is resolved against `configDir` — pass `configDir: import.meta.dirname`.",
    );
  }
  return readRuntimeE2E(resolve(configDir, playground));
}

/**
 * Shared Playwright config for plumix e2e suites: common defaults, with
 * per-suite port, playground, testDir, base URL and command as parameters.
 */
export function definePlumixE2EConfig(
  options: PlumixE2EConfigOptions,
): PlaywrightTestConfig<object, PlumixWorkerOptions> {
  if (
    options.playground !== undefined &&
    options.webServerCommand !== undefined
  ) {
    throw new Error(
      "definePlumixE2EConfig: `playground` and `webServerCommand` are mutually exclusive — pick one.",
    );
  }
  if (
    options.playground === undefined &&
    options.webServerCommand === undefined
  ) {
    throw new Error(
      "definePlumixE2EConfig: must provide either `playground` (worker-driven) or `webServerCommand` (custom).",
    );
  }
  if (
    options.inspectorPort !== undefined &&
    options.webServerCommand !== undefined
  ) {
    throw new Error(
      "definePlumixE2EConfig: `inspectorPort` only affects the baked `plumix dev` command and is incompatible with a custom `webServerCommand`.",
    );
  }

  const port = resolveE2EPort(options.port ?? DEFAULT_PORT);
  const origin = `http://localhost:${String(port)}`;
  const baseURL = options.baseURL ?? `${origin}${ADMIN_BASE}/`;
  const isPlayground = options.playground !== undefined;
  const seedAdmin = isPlayground && options.seedAdminSession !== false;
  // `sharedDatabase: false`: specs never share a database (apps/demo has one
  // per session), so there's nothing to pin or snapshot.
  const hasSharedDb = isPlayground && options.sharedDatabase !== false;
  const runtime =
    options.playground === undefined
      ? undefined
      : playgroundRuntime(options.configDir, options.playground);
  const webServerCommand =
    options.webServerCommand ??
    (options.playground !== undefined && runtime !== undefined
      ? bakePlaygroundCommand({
          playground: options.playground,
          cli: runtime.cli ?? "pnpm exec plumix",
          port,
          inspectorPort:
            options.inspectorPort === undefined
              ? undefined
              : resolveE2EPort(options.inspectorPort),
          extraSetup: options.extraSetup,
        })
      : "");

  return defineConfig<object, PlumixWorkerOptions>({
    testDir: options.testDir ?? ".",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    // Tests sharing one mutable D1 would race across workers and each restore
    // the baseline mid-run.
    workers: hasSharedDb ? 1 : undefined,
    // The failure-artifact upload globs `**/playwright-report/`, so CI writes
    // the HTML report; `open: "never"` keeps it from launching a browser.
    reporter: process.env.CI
      ? [["list"], ["github"], ["html", { open: "never" }]]
      : [["list"], ["html"]],
    ...(seedAdmin ? { globalSetup: "./globalSetup.ts" } : {}),
    use: {
      baseURL,
      trace: "on-first-retry",
      ...(seedAdmin ? { storageState: "./storageState.json" } : {}),
      // Read by the `plumixDbBaseline` fixture, which re-resolves this relative
      // path against the config file's directory, as the baked `cd
      // <playground>` does.
      plumixPlayground: hasSharedDb ? options.playground : undefined,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: superviseWebServer(webServerCommand),
      ...(options.webServerPort !== undefined
        ? { port: resolveE2EPort(options.webServerPort) }
        : {
            // The static admin shell answers before Vite's server pre-bundle
            // finishes, so readiness is a bare GET the handler answers; the
            // magic-link verify always 302s. Custom commands keep `baseURL`.
            url: isPlayground ? `${origin}${READINESS_PATH}` : baseURL,
          }),
      // Reuse would skip the state wipe, migrations and rebuild, and Playwright
      // doesn't check the responder is this suite's server.
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  });
}
