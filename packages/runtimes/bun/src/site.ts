import { hostname as machineName } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { Server } from "bun";
import type { PlumixConfig, PlumixEnv } from "plumix";
import type {
  DisposeOptions,
  DisposeResult,
  Invocation,
  PlumixApp,
  PlumixHandler,
  ScheduledEvent,
  ScheduledRunnerOptions,
  ScheduledRunReport,
  Scheduler,
  SchedulerClock,
} from "plumix/runtime";
import { applyBuiltMigrations } from "plumix/cli";
import {
  buildApp,
  createJsonLogger,
  createRuntimeHandler,
  DRAIN_DEADLINE_MS,
  startScheduledRunner,
  trustRequest,
} from "plumix/runtime";

import type { ResolvedBunConfig } from "./adapter.js";
import { bun, isBunRuntime } from "./adapter.js";
import { isBunSqlite } from "./bun-sqlite.js";
import { migrations } from "./commands/migrations.js";
import { ASSETS_DIR_ENV, PROJECT_ROOT_ENV } from "./entry-constants.js";
import { createAssetsLayer } from "./http/assets.js";
import { createImageLayer } from "./http/images.js";

export interface BunSiteOptions {
  readonly config: PlumixConfig;
  /**
   * Vite's client manifest, which the entry reads from
   * `virtual:plumix/asset-manifest` — `{}` in dev, the parsed
   * `.vite/manifest.json` in a build.
   */
  readonly assetManifest: PlumixApp["assetManifest"];
  /**
   * Each plugin's compiled catalogs by locale, which the entry reads from
   * `virtual:plumix/plugin-catalogs` — what SSR block renders resolve plugin
   * strings from.
   */
  readonly pluginCatalogs?: NonNullable<
    Parameters<typeof buildApp>[1]
  >["pluginCatalogs"];
  /**
   * Core's catalogs projected onto the enabled locales, which the entry reads
   * from `virtual:plumix/catalog-locales`.
   */
  readonly catalogLocales?: NonNullable<
    Parameters<typeof buildApp>[1]
  >["catalogLocales"];
  /**
   * The entry's own `import.meta.url`. `dist/client` sits beside the module
   * and the project root two levels up, so this names both.
   */
  readonly entryUrl: string;
}

/**
 * The portable pair the entry default-exports when imported — the same
 * `{ fetch, scheduled }` shape a Worker exports, with the invocation
 * defaulted to the process env.
 */
export interface BunSiteHandler {
  readonly fetch: (
    request: Request,
    invocation?: Invocation,
  ) => Promise<Response>;
  /**
   * Fire one schedule and answer with what it did. The report is the only
   * account of a task that threw; a caller that drops it silences every
   * scheduled-run failure.
   */
  readonly scheduled: (
    event: ScheduledEvent,
    invocation?: Invocation,
  ) => Promise<void | ScheduledRunReport>;
}

/** What `Bun.serve` runs the site with, bar where it listens. */
export interface BunSiteServe {
  readonly fetch: (
    request: Request,
    server: Server<undefined>,
  ) => Promise<Response>;
  readonly idleTimeout: number;
  readonly maxRequestBodySize: number;
  /**
   * Off in every mode: Bun's development error page carries the stack, and
   * this is the production serve path.
   */
  readonly development: false;
}

/**
 * `db` is the runner's test seam; an embedder's cron writes to the site's own
 * database.
 */
export type BunCronOverrides = Omit<
  ScheduledRunnerOptions,
  "app" | "env" | "fire" | "db" | "holder"
>;

export interface BunSite {
  readonly handler: BunSiteHandler;
  /** Spread into `Bun.serve` by an embedder picking its own port. */
  readonly serve: BunSiteServe;
  /**
   * Not `Bun.cron`, which reads a `*`-led day field differently. `stop()` waits
   * for the run in flight. Building the site starts no background work.
   */
  readonly startCron: (overrides?: BunCronOverrides) => Promise<Scheduler>;
  /**
   * Resolves how many tasks were abandoned. Not terminal: a later request
   * rebinds what this released.
   */
  readonly dispose: (options?: DisposeOptions) => Promise<DisposeResult>;
  /**
   * Applies the histories `plumix build` shipped beside the entry to the
   * `bunSqlite()` file; another database slot is migrated with its own tooling.
   */
  readonly migrate: () => Promise<void>;
}

/**
 * A stream the client holds open for live updates idles between events by
 * design, so the idle timeout would cut it.
 */
function isEventStream(response: Response): boolean {
  return (
    response.headers.get("content-type")?.startsWith("text/event-stream") ??
    false
  );
}

/**
 * Everything the generated Bun entry does beyond importing and calling,
 * bar running the process. The generator holds imports and calls, never
 * control flow (#2303).
 */
export function createBunSite({
  config,
  assetManifest,
  pluginCatalogs,
  catalogLocales,
  entryUrl,
}: BunSiteOptions): BunSite {
  const serverDir = dirname(fileURLToPath(entryUrl));
  const assetsDir = resolve(serverDir, "../client");
  const env: PlumixEnv = {
    ...process.env,
    [ASSETS_DIR_ENV]: assetsDir,
    [PROJECT_ROOT_ENV]: resolve(serverDir, "../.."),
  };
  const { trustProxy, bodySizeLimit, idleTimeout }: ResolvedBunConfig =
    isBunRuntime(config.runtime) ? config.runtime.config : bun().config;

  // Dev keeps the console's readable output; a build writes what a log drain parses.
  const logger = process.env.PLUMIX_DEV
    ? undefined
    : createJsonLogger((line) => process.stdout.write(line));

  const appPromise = buildApp(config, {
    assetManifest,
    pluginCatalogs,
    catalogLocales,
  });
  let built: PlumixHandler | undefined;
  const handlerFor = (app: PlumixApp): PlumixHandler =>
    (built ??= createRuntimeHandler(app, { logger }));

  const handler: BunSiteHandler = {
    async fetch(request, invocation = { env }) {
      return handlerFor(await appPromise).fetch(request, invocation);
    },
    async scheduled(event, invocation = { env }) {
      return handlerFor(await appPromise).scheduled?.(event, invocation);
    },
  };

  const assets = createAssetsLayer({ root: assetsDir });
  // A same-origin image source is whatever the process would serve at that
  // path: a built asset, else the site as an anonymous GET.
  const images = createImageLayer(config.imageDelivery, {
    assets,
    basePath: config.basePath,
    fetch: (request, clientAddress) =>
      handler.fetch(request, { env, clientAddress }),
  });

  const serve: BunSiteServe = {
    async fetch(request, server) {
      let trusted: Request;
      let clientAddress: string | undefined;
      try {
        const decided = trustRequest(
          request,
          {
            // `Bun.serve` here listens without TLS; a TLS-terminating proxy
            // in front is what `trustProxy` is for.
            scheme: "http",
            port: server.port ?? 0,
            // `null` on a unix socket, which has no peer address.
            remoteAddress: server.requestIP(request)?.address,
          },
          { trustProxy },
        );
        clientAddress = decided.clientAddress;
        // The original as init, so its body and abort signal carry over.
        trusted = new Request(decided.url, request);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      const asset = await assets.serve(trusted);
      if (asset !== null) return asset;
      const image = await images.serve(trusted, clientAddress);
      if (image !== null) return image;
      const response = await handler.fetch(trusted, { env, clientAddress });
      if (isEventStream(response)) server.timeout(request, 0);
      return response;
    },
    idleTimeout,
    maxRequestBodySize: bodySizeLimit,
    development: false,
  };

  const startCron = async (
    overrides: BunCronOverrides = {},
  ): Promise<Scheduler> => {
    const app = await appPromise;
    return startScheduledRunner({
      app,
      env,
      holder: `${machineName()}:${String(process.pid)}`,
      fire: (cron, scheduledTime, signal) =>
        handler.scheduled(
          { scheduledTime, cron },
          { env, ...(signal === undefined ? {} : { signal }) },
        ),
      logger,
      ...overrides,
    });
  };

  const dispose = (options?: DisposeOptions): Promise<DisposeResult> =>
    built?.dispose?.(options) ?? Promise.resolve({ abandoned: 0 });

  const migrate = async (): Promise<void> => {
    if (!isBunSqlite(config.database)) return;
    await applyBuiltMigrations({
      serverDir,
      cwd: resolve(serverDir, "../.."),
      config,
      migrations,
    });
  };

  return { handler, serve, startCron, dispose, migrate };
}

/**
 * A variable the environment already set wins, so a stray file can't override
 * injected secrets. Bun's own loading is off via `env = false` in
 * `bunfig.toml`.
 */
export function loadEnvFileWhenMain(main: boolean): void {
  if (!main) return;
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Where `SIGTERM` and `SIGINT` arrive: the process, bar a test. */
interface SignalSource {
  on(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
  off(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
}

export interface ServeProcessOptions {
  /** Test seam: where the shutdown signals arrive, so a drain needs no real one. */
  readonly signals?: SignalSource;
  /** Test seam: what the drain reads its deadline from and sleeps on. */
  readonly clock?: SchedulerClock;
  /** Test seam: what ends the process. */
  readonly exit?: (code: number) => void;
}

/**
 * Returns the `Server` for the entry to default-export, which Bun does not
 * serve twice. A failed {@link BunSite.migrate} ends the process with exit
 * code 1 and never listens.
 */
export async function serveProcess(
  site: BunSite,
  {
    signals = process,
    clock = processClock,
    exit = (code) => process.exit(code),
  }: ServeProcessOptions = {},
): Promise<Server<undefined> | undefined> {
  try {
    await site.migrate();
  } catch (error) {
    console.error("plumix: migrations failed; not serving", error);
    exit(1);
    return undefined;
  }
  /* eslint-disable turbo/no-undeclared-env-vars -- the built site reads these when it runs, not during any turbo task */
  const port = Number(envOr(process.env.PORT, "3000"));
  const hostname = envOr(process.env.HOST, "0.0.0.0");
  /* eslint-enable turbo/no-undeclared-env-vars */
  const server = Bun.serve({ ...site.serve, port, hostname });
  console.log(`plumix: listening on http://${hostname}:${String(server.port)}`);

  // Never awaited by the listen: a scheduler failing to start must not take
  // down a serving process.
  let scheduler: Scheduler | undefined;
  let stopping = false;
  void site.startCron().then(
    // A signal can land while `buildApp` is still running; without this the
    // scheduler would start behind the shutdown and fire into its drain.
    (started) => {
      scheduler = started;
      if (stopping) void started.stop({ timeoutMs: 0 });
    },
    (error: unknown) => {
      console.error("plumix: cron failed to start", error);
    },
  );

  // Both listeners come off, so a second signal of either kind falls to the
  // default action and ends the process at once.
  const drain = async (signal: NodeJS.Signals): Promise<void> => {
    signals.off("SIGTERM", shutdown);
    signals.off("SIGINT", shutdown);
    console.log(`plumix: ${signal} received, draining`);
    const deadline = clock.now() + DRAIN_DEADLINE_MS;
    // On Bun 1.4 `stop()` resolves once the in-flight requests have finished.
    const stopped = server.stop().then(() => true);
    // Before `dispose()`: a firing started behind the drain would hand it more
    // deferred work.
    stopping = true;
    const cronSettled =
      (await scheduler?.stop({ timeoutMs: remainingMs(clock, deadline) })) ??
      true;
    const finished = await Promise.race([
      stopped,
      clock.sleep(remainingMs(clock, deadline)).then(() => false),
    ]);
    if (!finished) await server.stop(true);
    const { abandoned } = await site.dispose({
      timeoutMs: remainingMs(clock, deadline),
    });
    if (!cronSettled) {
      console.error(
        `plumix: exiting with a scheduled run cut; the ${String(DRAIN_DEADLINE_MS)}ms shutdown budget ran out`,
      );
    }
    if (!finished) {
      console.error(
        `plumix: exiting with in-flight responses cut; the ${String(DRAIN_DEADLINE_MS)}ms shutdown budget ran out`,
      );
    }
    if (abandoned > 0) {
      console.error(
        `plumix: exiting with ${String(abandoned)} deferred task(s) abandoned`,
      );
    }
    exit(!cronSettled || !finished || abandoned > 0 ? 1 : 0);
  };
  const shutdown = (signal: NodeJS.Signals): void => void drain(signal);
  signals.on("SIGTERM", shutdown);
  signals.on("SIGINT", shutdown);
  return server;
}

/**
 * Unref'd: when the stop wins, the drain's timer outlives the race, and a
 * pending tick must not be what keeps the process alive.
 */
const processClock: SchedulerClock = {
  now: () => Date.now(),
  sleep: (ms) => sleep(ms, undefined, { ref: false }),
};

function remainingMs(clock: SchedulerClock, deadline: number): number {
  return Math.max(0, deadline - clock.now());
}

/**
 * `??` would read an empty `PORT=` as port 0, and `prefer-nullish-coalescing`
 * refuses `||` here.
 */
function envOr(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}
