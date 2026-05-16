import type { PlaywrightTestConfig } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";

export interface PlumixE2EConfigOptions {
  /**
   * Port the worker / preview listens on. Used to derive `baseURL`
   * when not explicitly set, and passed through to the baked
   * `plumix dev --port <port>` so the worker binds where playwright
   * polls. Suites should pick distinct ports so they can run in
   * parallel under turbo without colliding. Defaults to `5173`
   * (vite's default) for back-compat.
   */
  readonly port?: number;
  /**
   * Explicit workerd inspector port baked into `plumix dev
   * --inspector-port <port>`. `@cloudflare/vite-plugin` otherwise
   * auto-allocates from 9229 upward, which collides when multiple
   * worker-driven e2e suites boot in parallel under turbo. Suites
   * should pick distinct ports (convention: mirror the HTTP port —
   * 3010 ↔ 9310, 3020 ↔ 9320, …). Ignored when `playground` is unset.
   */
  readonly inspectorPort?: number;
  /**
   * Optional path to a playground workspace (relative to the playwright
   * config file). When set, `definePlumixE2EConfig` bakes the standard
   * worker-driven webServer setup: wipe `.wrangler/state` → apply D1
   * migrations → run `plumix dev`. Also auto-wires `globalSetup.ts` and
   * `storageState.json` by convention. Mutually exclusive with an
   * explicit `webServerCommand`.
   */
  readonly playground?: string;
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
   * Optional. When set, the webServer readiness check waits for the
   * TCP port to open instead of polling `baseURL` for a 2xx/3xx
   * response. Use this when the dev server starts but `/` returns
   * 404 (e.g. a public-route example whose front page isn't wired) —
   * waiting on the URL would otherwise time out forever.
   */
  readonly webServerPort?: number;
  /**
   * Optional shell step to run inside the baked playground command,
   * after the D1 migrations apply and before `plumix dev` starts.
   * Use for fixture seeds that need to live in D1 before the worker
   * comes up (e.g. `wrangler d1 execute <db> --local --file=seed.sql`).
   * Only meaningful when `playground` is set.
   */
  readonly extraSetup?: string;
  /**
   * When `playground` is set, the helper auto-wires the worker-driven
   * `globalSetup.ts` + `storageState.json` convention so the admin
   * shell is already authenticated when tests start. Pass `false`
   * here to skip that wiring — useful for public-route specs that
   * never need an admin session.
   */
  readonly seedAdminSession?: boolean;
}

const ADMIN_BASE = "/_plumix/admin";
const DEFAULT_BINDING = "DB";
const DEFAULT_PORT = 5173;

function bakePlaygroundCommand(
  playground: string,
  port: number,
  inspectorPort: number | undefined,
  extraSetup: string | undefined,
): string {
  const steps = [
    `cd ${playground}`,
    "rm -rf .wrangler/state",
    "pnpm exec plumix migrate generate",
    `pnpm exec wrangler d1 migrations apply ${DEFAULT_BINDING} --local`,
  ];
  if (extraSetup) steps.push(extraSetup);
  const devFlags = [`--port ${String(port)}`];
  if (inspectorPort !== undefined) {
    devFlags.push(`--inspector-port ${String(inspectorPort)}`);
  }
  steps.push(`pnpm exec plumix dev ${devFlags.join(" ")}`);
  return steps.join(" && ");
}

/**
 * Shared Playwright config for plumix e2e suites. Standardises the
 * options every suite wants the same way (chromium-only project,
 * fullyParallel, CI retry/worker tuning, github reporter on CI) and
 * leaves the per-suite knobs — port, playground, testDir, base URL,
 * the build/preview command — as parameters.
 *
 * When `playground` is set, the helper bakes a worker-driven webServer
 * (wipe state → apply migrations → `plumix dev`) and wires the
 * `globalSetup.ts` / `storageState.json` convention used by the
 * worker-driven plugin e2e pattern. Otherwise the caller supplies
 * `webServerCommand` directly.
 *
 * Used by `packages/admin/playwright.config.ts` and each
 * `packages/plugins/<plugin>/e2e/playwright.config.ts`.
 */
export function definePlumixE2EConfig(
  options: PlumixE2EConfigOptions,
): PlaywrightTestConfig {
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

  const port = options.port ?? DEFAULT_PORT;
  const baseURL =
    options.baseURL ?? `http://localhost:${String(port)}${ADMIN_BASE}/`;
  const isPlayground = options.playground !== undefined;
  const seedAdmin = isPlayground && options.seedAdminSession !== false;
  const webServerCommand =
    options.webServerCommand ??
    (options.playground !== undefined
      ? bakePlaygroundCommand(
          options.playground,
          port,
          options.inspectorPort,
          options.extraSetup,
        )
      : "");

  return defineConfig({
    testDir: options.testDir ?? ".",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    // On CI: write the HTML report alongside the inline GitHub annotations
    // so the failure-artifact upload (which globs `**/playwright-report/`)
    // has something to capture — without `["html"]` it never gets generated.
    // `open: "never"` keeps `pnpm test:e2e` from trying to launch a browser
    // post-run on CI.
    reporter: process.env.CI
      ? [["list"], ["github"], ["html", { open: "never" }]]
      : [["list"], ["html"]],
    ...(seedAdmin ? { globalSetup: "./globalSetup.ts" } : {}),
    use: {
      baseURL,
      trace: "on-first-retry",
      ...(seedAdmin ? { storageState: "./storageState.json" } : {}),
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: webServerCommand,
      ...(options.webServerPort !== undefined
        ? { port: options.webServerPort }
        : { url: baseURL }),
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  });
}
