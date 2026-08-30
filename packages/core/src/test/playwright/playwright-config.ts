import type { PlaywrightTestConfig } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";

import type { PlumixWorkerOptions } from "./test.js";

export interface PlumixE2EConfigOptions {
  /**
   * Base port the worker / preview listens on. Used to derive `baseURL`
   * when not explicitly set, and passed through to the baked
   * `plumix dev --port <port>` so the worker binds where playwright
   * polls. Suites should pick distinct ports so they can run in
   * parallel under turbo without colliding. Defaults to `5173`
   * (vite's default) for back-compat.
   *
   * This is a *base*: `PLUMIX_E2E_PORT_OFFSET` shifts it (and every
   * other port here) so a second checkout can move the whole block off
   * a busy range without editing any config. See `resolveE2EPort`.
   */
  readonly port?: number;
  /**
   * Explicit workerd inspector port baked into `plumix dev
   * --inspector-port <port>`. `@cloudflare/vite-plugin` otherwise
   * auto-allocates from 9229 upward, which collides when multiple
   * worker-driven e2e suites boot in parallel under turbo. Suites
   * should pick distinct ports (convention: mirror the HTTP port —
   * 3010 ↔ 9310, 3020 ↔ 9320, …). Ignored when `playground` is unset.
   * Shifted by `PLUMIX_E2E_PORT_OFFSET` like every other port here.
   */
  readonly inspectorPort?: number;
  /**
   * Optional path to a playground workspace (relative to the playwright
   * config file). When set, `definePlumixE2EConfig` bakes the standard
   * worker-driven webServer setup: wipe `.wrangler/state` → generate
   * migrations → apply them (unless `applyMigrations: false`) → run
   * `plumix dev`.
   * Also auto-wires `globalSetup.ts` and `storageState.json` by convention.
   * Mutually exclusive with an explicit `webServerCommand`.
   *
   * The `rm -rf .wrangler/state` step belongs to the webServer, so it runs
   * once per suite run and never per retry. Import `test` from
   * `plumix/test/playwright` and the `plumixDbBaseline` fixture closes that
   * gap, restoring the post-`globalSetup` database once per attempt; a
   * suite importing `@playwright/test` directly still meets whatever its
   * failed attempt left behind (#1923).
   */
  readonly playground?: string;
  /**
   * Whether the baked command applies the generated migrations to the
   * playground's database before starting the worker. Defaults to `true`.
   * Set `false` when there is no database to migrate up front — e.g. one
   * created per session at runtime, which applies its own schema. Migrations
   * are still generated either way. Only meaningful when `playground` is set.
   */
  readonly applyMigrations?: boolean;
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
   * waiting on the URL would otherwise time out forever. Pass the same
   * base as `port`; it is shifted by `PLUMIX_E2E_PORT_OFFSET` too, so
   * readiness keeps watching the port the server actually binds.
   */
  readonly webServerPort?: number;
  /**
   * Optional shell step to run inside the baked playground command, after
   * migrations are generated and applied, and before `plumix dev` starts.
   * Use for fixture seeds that need to live in the database before the
   * worker comes up (e.g. `wrangler d1 execute <db> --local
   * --file=seed.sql`). Only meaningful when `playground` is set.
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
const PORT_OFFSET_ENV = "PLUMIX_E2E_PORT_OFFSET";
const DEFAULT_BINDING = "DB";
const DEFAULT_PORT = 5173;

/**
 * Shifts a suite's declared base port by `PLUMIX_E2E_PORT_OFFSET`.
 *
 * Every port in an e2e suite — HTTP, workerd inspector, readiness —
 * moves by the same offset, so the spacing that keeps suites from
 * colliding under a parallel `turbo run test:e2e` is preserved by
 * construction. Unset or blank means no shift, so the baked literals
 * are what runs by default.
 *
 * Exported because the admin-family suites assemble their own
 * `vite preview --port <n> --strictPort` command strings and explicit
 * base URLs, which `definePlumixE2EConfig` never sees. They must
 * resolve through here rather than re-deriving the arithmetic.
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

function bakePlaygroundCommand(
  playground: string,
  port: number,
  inspectorPort: number | undefined,
  extraSetup: string | undefined,
  applyMigrations: boolean,
): string {
  const steps = [
    `cd ${playground}`,
    // `drizzle/` is gitignored and regenerated each run; one left from an
    // older schema makes drizzle-kit ask how to resolve a rename — a
    // prompt it cannot issue on a pipe — and keep the stale migrations.
    // Safe only because the generate below refills it: apps/demo globs
    // `./drizzle/*.sql` for its per-session schema, so these two steps
    // cannot be separated.
    "rm -rf .wrangler/state drizzle",
    "pnpm exec plumix migrate generate",
  ];
  if (applyMigrations) {
    steps.push(
      `pnpm exec wrangler d1 migrations apply ${DEFAULT_BINDING} --local`,
    );
  }
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
 * (wipe state → generate migrations → apply them unless
 * `applyMigrations: false` → `plumix dev`) and wires the `globalSetup.ts` / `storageState.json`
 * convention used by the worker-driven plugin e2e pattern. Otherwise the
 * caller supplies `webServerCommand` directly.
 *
 * Used by `packages/admin/playwright.config.ts` and each
 * `packages/plugins/<plugin>/e2e/playwright.config.ts`.
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
  const baseURL =
    options.baseURL ?? `http://localhost:${String(port)}${ADMIN_BASE}/`;
  const isPlayground = options.playground !== undefined;
  const seedAdmin = isPlayground && options.seedAdminSession !== false;
  // `applyMigrations: false` is how a playground says it has no D1 to
  // migrate up front — apps/demo builds one per session in a Durable
  // Object instead. Nothing to pin to one worker, and nothing for the
  // baseline fixture to snapshot.
  const hasSharedDb = isPlayground && options.applyMigrations !== false;
  const webServerCommand =
    options.webServerCommand ??
    (options.playground !== undefined
      ? bakePlaygroundCommand(
          options.playground,
          port,
          options.inspectorPort === undefined
            ? undefined
            : resolveE2EPort(options.inspectorPort),
          options.extraSetup,
          options.applyMigrations !== false,
        )
      : "");

  return defineConfig<object, PlumixWorkerOptions>({
    testDir: options.testDir ?? ".",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    // Tests sharing one mutable D1 race across workers and would each restore
    // the baseline mid-run (see `test.ts`). Nothing else needs serializing —
    // this used to pin every suite whenever CI was set.
    workers: hasSharedDb ? 1 : undefined,
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
      // Read by the `plumixDbBaseline` fixture in `test.ts`; inert for a
      // suite that imports `test` from `@playwright/test`. Stays relative
      // because the fixture re-resolves it against the config file's
      // directory, which is what the baked `cd <playground>` uses too.
      plumixPlayground: hasSharedDb ? options.playground : undefined,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: webServerCommand,
      ...(options.webServerPort !== undefined
        ? { port: resolveE2EPort(options.webServerPort) }
        : { url: baseURL }),
      // Never adopt whatever already answers on the port. Playwright
      // does not check that the responder is this suite's build, and
      // reuse skips the whole command above — the `.wrangler/state`
      // wipe, the migrations, the rebuild — so even a legitimately-ours
      // server means running against stale data and a stale build.
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  });
}
