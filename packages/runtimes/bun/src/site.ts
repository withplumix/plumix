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
  ScheduledRunReport,
} from "plumix/runtime";
import { buildApp, DRAIN_DEADLINE_MS, trustRequest } from "plumix/runtime";

import type { ResolvedBunConfig } from "./adapter.js";
import { bun, isBunRuntime } from "./adapter.js";
import { ASSETS_DIR_ENV, PROJECT_ROOT_ENV } from "./entry-constants.js";
import { createAssetsLayer } from "./http/assets.js";

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

export interface BunSite {
  readonly handler: BunSiteHandler;
  /**
   * The serve path: the built assets first, then the site, behind the shared
   * trust rules. Spread into `Bun.serve` by an embedder that picks its own
   * port; `serveProcess` is the process that does.
   */
  readonly serve: BunSiteServe;
  /**
   * Drain the deferred work no invocation carried away — telemetry delivery,
   * cache purges — and release the handler's database connection. Resolves
   * how many tasks were abandoned. Not terminal: a later request rebinds what
   * this released.
   */
  readonly dispose: (options?: DisposeOptions) => Promise<DisposeResult>;
}

// A stream the client holds open for live updates idles between events by
// design, so the idle timeout would cut it.
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

  const appPromise = buildApp(config, { assetManifest, pluginCatalogs });
  let built: PlumixHandler | undefined;
  const handlerFor = (app: PlumixApp): PlumixHandler =>
    (built ??= config.runtime.createHandler(app));

  const handler: BunSiteHandler = {
    async fetch(request, invocation = { env }) {
      return handlerFor(await appPromise).fetch(request, invocation);
    },
    async scheduled(event, invocation = { env }) {
      return handlerFor(await appPromise).scheduled?.(event, invocation);
    },
  };

  const assets = createAssetsLayer({ root: assetsDir });

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
      const response = await handler.fetch(trusted, { env, clientAddress });
      if (isEventStream(response)) server.timeout(request, 0);
      return response;
    },
    idleTimeout,
    maxRequestBodySize: bodySizeLimit,
    development: false,
  };

  const dispose = (options?: DisposeOptions): Promise<DisposeResult> =>
    built?.dispose?.(options) ?? Promise.resolve({ abandoned: 0 });

  return { handler, serve, dispose };
}

/**
 * Load `.env` from the working directory into the process env when `main`
 * says this module is the process's entry point. A variable the environment
 * already set wins, so a stray file cannot override a platform's injected
 * secrets; a missing file loads nothing. Bun's own loading, which would also
 * read `.env.local` and `.env.{NODE_ENV}`, is what `env = false` in
 * `bunfig.toml` turns off.
 */
export function loadEnvFileWhenMain(main: boolean): void {
  if (!main) return;
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Run the site as a process: `Bun.serve` on `PORT` and `HOST`, and the
 * shutdown protocol. The entry calls it only when it is the process's entry
 * point, and default-exports the `Server` it returns, which Bun does not
 * serve a second time.
 */
export function serveProcess(site: BunSite): Server<undefined> {
  /* eslint-disable turbo/no-undeclared-env-vars -- the built site reads these when it runs, not during any turbo task */
  const port = Number(envOr(process.env.PORT, "3000"));
  const hostname = envOr(process.env.HOST, "0.0.0.0");
  /* eslint-enable turbo/no-undeclared-env-vars */
  const server = Bun.serve({ ...site.serve, port, hostname });
  console.log(`plumix: listening on http://${hostname}:${String(server.port)}`);

  // Both listeners come off, so a second signal of either kind falls to the
  // default action and ends the process at once.
  const drain = async (signal: NodeJS.Signals): Promise<void> => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
    console.log(`plumix: ${signal} received, draining`);
    const deadline = Date.now() + DRAIN_DEADLINE_MS;
    // On Bun 1.4 `stop()` resolves once the in-flight requests have finished.
    const finished = await Promise.race([
      server.stop().then(() => true),
      // Unref'd: when the stop wins, this timer outlives the race, and a
      // pending tick must not be what keeps the process alive.
      sleep(remainingMs(deadline), false, { ref: false }),
    ]);
    if (!finished) await server.stop(true);
    const { abandoned } = await site.dispose({
      timeoutMs: remainingMs(deadline),
    });
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
    process.exit(!finished || abandoned > 0 ? 1 : 0);
  };
  const shutdown = (signal: NodeJS.Signals): void => void drain(signal);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return server;
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
