import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  DisposeOptions,
  DisposeResult,
  Invocation,
  PlumixApp,
  PlumixConfig,
  PlumixEnv,
  PlumixHandler,
  ScheduledEvent,
  ScheduledRunReport,
} from "plumix";
import { buildApp, renderDevBootErrorResponse } from "plumix";

import type { NodeConfig } from "./adapter.js";
import type { RequestHandler, RequestListener } from "./http/bridge.js";
import type { ScheduledRunnerOptions } from "./scheduled-runner.js";
import type { Scheduler } from "./scheduler.js";
import { isNodeRuntime } from "./adapter.js";
import { ASSETS_DIR_ENV, DRAIN_DEADLINE_MS } from "./entry-constants.js";
import { createAssetsLayer } from "./http/assets.js";
import { createRequestListener } from "./http/bridge.js";
import { createImageLayer } from "./http/images.js";
import { startScheduledRunner } from "./scheduled-runner.js";

export interface NodeSiteOptions {
  readonly config: PlumixConfig;
  /**
   * Vite's client manifest, which the entry reads from
   * `virtual:plumix/asset-manifest` — `{}` in dev, the parsed
   * `.vite/manifest.json` in a build.
   */
  readonly assetManifest: PlumixApp["assetManifest"];
  /**
   * The entry's own `import.meta.url`. `dist/client` sits beside the module,
   * so this is what names the assets directory the handler serves from.
   */
  readonly entryUrl: string;
}

/**
 * The portable pair the entry default-exports — the same `{ fetch, scheduled }`
 * shape a Worker exports, with the invocation defaulted to the process env.
 */
export interface NodeSiteHandler {
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

export type CronOverrides = Omit<
  ScheduledRunnerOptions,
  "app" | "env" | "fire"
>;

export interface NodeSite {
  readonly handler: NodeSiteHandler;
  /**
   * Connect-style listener for embedding: the built assets first, then image
   * transforms, then the site, which answers every request.
   */
  readonly listener: RequestListener;
  /**
   * Start firing this site's scheduled tasks, returning a handle whose
   * `stop()` waits for the run in flight. An embedder calls it when it wants
   * cron, so building the site starts no background work on its own.
   */
  readonly startCron: (overrides?: CronOverrides) => Promise<Scheduler>;
  /**
   * Drain the deferred work no invocation carried away — telemetry delivery,
   * cache purges — and release the handler's database connection. A host
   * embedding `listener` owes the site this on its own shutdown; the process
   * `serveWhenMain` runs calls it on `SIGTERM`. Resolves how many tasks were
   * abandoned. Not terminal: a later request rebinds what this released.
   */
  readonly dispose: (options?: DisposeOptions) => Promise<DisposeResult>;
  /**
   * Run the site as a process — an `http` server in front of `listener`, cron
   * unless the config turned it off, and the shutdown protocol — when `main`
   * says this module is the process's entry point. A no-op otherwise, so
   * importing the entry to embed it serves nothing.
   */
  readonly serveWhenMain: (main: boolean) => ServingProcess | undefined;
}

/**
 * Everything the generated Node entry does beyond importing and calling.
 *
 * The rule the generator now follows: a generated entry holds imports and
 * calls, never control flow. Orchestration written as string literals is
 * neither type-checked nor linted nor reachable by a test, which is how the
 * entry came to drop `handler.scheduled`'s report and silence every cron
 * failure (#2303).
 */
export function createNodeSite({
  config,
  assetManifest,
  entryUrl,
}: NodeSiteOptions): NodeSite {
  const assetsDir = resolve(dirname(fileURLToPath(entryUrl)), "../client");
  const env: PlumixEnv = { ...process.env, [ASSETS_DIR_ENV]: assetsDir };
  const nodeConfig: NodeConfig = isNodeRuntime(config.runtime)
    ? config.runtime.config
    : {};
  const { trustProxy, bodySizeLimit, cron } = nodeConfig;

  const appPromise = buildApp(config, { assetManifest });
  let built: PlumixHandler | undefined;
  const handlerFor = (app: PlumixApp): PlumixHandler =>
    (built ??= config.runtime.createHandler(app));

  const handler: NodeSiteHandler = {
    async fetch(request, invocation = { env }) {
      let app: PlumixApp;
      try {
        app = await appPromise;
      } catch (bootError) {
        // Dev-only, statically false in a build so the branch and the
        // renderer tree-shake out; see the Cloudflare entry.
        if (process.env.PLUMIX_DEV) {
          return renderDevBootErrorResponse(bootError);
        }
        throw bootError;
      }
      return handlerFor(app).fetch(request, invocation);
    },
    async scheduled(event, invocation = { env }) {
      const app = await appPromise;
      return handlerFor(app).scheduled?.(event, invocation);
    },
  };

  const siteFetch: RequestHandler = (request, meta) =>
    handler.fetch(request, { env, clientAddress: meta.clientAddress });

  const assets = createAssetsLayer({ root: assetsDir });
  const bridge = createRequestListener(siteFetch, {
    trustProxy,
    bodySizeLimit,
  });
  // A same-origin image source is whatever the process would serve at that
  // path: a built asset, else the site as an anonymous GET.
  const images = createImageLayer(config.imageDelivery, {
    assets,
    trustProxy,
    basePath: config.basePath,
    fetch: siteFetch,
  });

  const listener: RequestListener = (req, res) => {
    assets.serve(req, res, () =>
      images.serve(req, res, () => bridge(req, res)),
    );
  };

  const startCron = async (
    overrides: CronOverrides = {},
  ): Promise<Scheduler> => {
    const app = await appPromise;
    return startScheduledRunner({
      app,
      env,
      fire: (firedCron, scheduledTime) =>
        handler.scheduled({ scheduledTime, cron: firedCron }),
      ...overrides,
    });
  };

  const dispose = (options?: DisposeOptions): Promise<DisposeResult> =>
    built?.dispose?.(options) ?? Promise.resolve({ abandoned: 0 });

  return {
    handler,
    listener,
    startCron,
    dispose,
    serveWhenMain(main) {
      if (!main) return undefined;
      return serveProcess({
        listener,
        startCron,
        dispose,
        cron: cron !== false,
      });
    },
  };
}

export interface ServeProcessOptions extends Pick<
  NodeSite,
  "listener" | "startCron" | "dispose"
> {
  /** `cron: false` hands the schedules to an external scheduler instead. */
  readonly cron: boolean;
  /** Test seam: what ends the process, so a drain can be driven without one. */
  readonly exit?: (code: number) => void;
  /** Test seam: the shutdown budget, so a test need not spend the real one. */
  readonly drainDeadlineMs?: number;
}

export interface ServingProcess {
  /** What the signal listeners call; returned so a test can drive it. */
  readonly drain: (signal: NodeJS.Signals) => Promise<void>;
  /** The server, still binding when this returns; a test reads its port. */
  readonly server: Server;
}

// Not on the barrel: `serveWhenMain` is the door, and this is what a test
// drives to reach the drain without ending the runner.
export function serveProcess({
  listener,
  startCron,
  dispose,
  cron,
  exit = (code) => process.exit(code),
  drainDeadlineMs = DRAIN_DEADLINE_MS,
}: ServeProcessOptions): ServingProcess {
  /* eslint-disable turbo/no-undeclared-env-vars -- the built site reads these when it runs, not during any turbo task */
  const port = Number(envOr(process.env.PORT, "3000"));
  const host = envOr(process.env.HOST, "0.0.0.0");
  /* eslint-enable turbo/no-undeclared-env-vars */
  const server = createServer(listener);
  server.listen(port, host, () => {
    // A TCP listen always yields an address object, never a pipe path.
    const { port: bound } = server.address() as AddressInfo;
    console.log(`plumix: listening on http://${host}:${String(bound)}`);
  });

  // Scheduled tasks are the site's own work, so they run wherever the site
  // runs. Started after `listen` and never awaited by it: building the app
  // must not delay serving, and a scheduler that cannot start must not take
  // down a process that is already answering requests.
  let scheduler: Scheduler | undefined;
  let stopping = false;
  if (cron) {
    void startCron().then(
      // A signal can land while `buildApp` is still running. Without this the
      // scheduler would start behind the shutdown and fire into its drain.
      (started) => {
        scheduler = started;
        if (stopping) void started.stop({ timeoutMs: 0 });
      },
      (error: unknown) => {
        console.error("plumix: cron failed to start", error);
      },
    );
  }

  // Both listeners come off, so a second signal of either kind falls to
  // Node's default and exits at once.
  const drain = async (signal: NodeJS.Signals): Promise<void> => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
    console.log(`plumix: ${signal} received, draining`);
    const deadline = Date.now() + drainDeadlineMs;
    const closed = new Promise<boolean>((settle) =>
      server.close(() => settle(true)),
    );
    server.closeIdleConnections();
    // Before the drain, not during it: `dispose()` waits for deferred work,
    // and a firing that started behind it would hand it more. Bounded by the
    // same budget the drain then spends, so a long task cannot hold the whole
    // shutdown open and leave `dispose()` nothing.
    stopping = true;
    await scheduler?.stop({ timeoutMs: remainingMs(deadline) });
    const finished = await Promise.race([
      closed,
      // Unref'd: when `closed` wins, this timer outlives the race, and a
      // pending tick must not be what keeps the process alive — the same
      // reason the scheduler unrefs its own.
      sleep(remainingMs(deadline), false, { ref: false }),
    ]);
    const { abandoned } = await dispose({ timeoutMs: remainingMs(deadline) });
    server.closeAllConnections();
    if (!finished) {
      console.error(
        `plumix: exiting with in-flight responses cut; the ${String(drainDeadlineMs)}ms shutdown budget ran out`,
      );
    }
    if (abandoned > 0) {
      console.error(
        `plumix: exiting with ${String(abandoned)} deferred task(s) abandoned`,
      );
    }
    exit(!finished || abandoned > 0 ? 1 : 0);
  };
  const shutdown = (signal: NodeJS.Signals): void => void drain(signal);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return { drain, server };
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

/**
 * `??` alone would read an empty `PORT=` as port 0; `||` is what this wants but
 * `prefer-nullish-coalescing` refuses it on a `string | undefined`.
 */
function envOr(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}
