import { join } from "node:path";
import type { ServerResponse } from "node:http";
import type { Connect, Logger, Plugin, ViteDevServer } from "vite";
import type { EvaluatedModules, ModuleRunner } from "vite/module-runner";
import {
  createRunnableDevEnvironment,
  createServer,
  isRunnableDevEnvironment,
  normalizePath,
} from "vite";

import type {
  CommandContext,
  PlumixConfig,
  PlumixHandler,
  RuntimeAdapter,
} from "@plumix/core";
import { isTrustedDevHost, renderDevBootErrorResponse } from "@plumix/core";

import type { ServerEnvironmentOptions } from "./server-environment.js";
import type { DevListener, LoadedSite } from "./site-reloader.js";
import { emitPlumixSources, plumix } from "./index.js";
import { serverEnvironment, serverExternals } from "./server-environment.js";
import { createSiteReloader } from "./site-reloader.js";

interface DevArgs {
  readonly port?: number;
  /** A name or address to bind, or `true` for every interface. */
  readonly host?: string | true;
}

export function parseDevArgs(argv: readonly string[]): DevArgs {
  const args: { port?: number; host?: string | true } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--port") {
      const raw = argv[i + 1];
      if (raw === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
        throw new Error(
          "plumix dev: --port requires a value (e.g. --port 3030)",
        );
      }
      args.port = parsePort(raw);
      i += 1;
      continue;
    }
    if (token?.startsWith("--port=")) {
      args.port = parsePort(token.slice("--port=".length));
      continue;
    }
    if (token === "--host") {
      const raw = argv[i + 1];
      if (raw === undefined || raw.startsWith("--")) {
        args.host = true;
        continue;
      }
      args.host = raw;
      i += 1;
      continue;
    }
    if (token?.startsWith("--host=")) {
      const raw = token.slice("--host=".length);
      // An empty name would bind every interface, silently.
      if (raw === "") {
        // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
        throw new Error(
          "plumix dev: --host= requires a value (e.g. --host=0.0.0.0, or --host for every interface)",
        );
      }
      args.host = raw;
      continue;
    }
  }
  return args;
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
    throw new Error(
      `plumix dev: --port value "${raw}" must be a number between 1 and 65535`,
    );
  }
  return port;
}

/**
 * Drop a changed file and everything that imports it from the runner's cache,
 * so the next import through the runner re-evaluates that chain up to the
 * entry. The module graph Vite invalidates on its own only governs what the
 * server *transforms*; what the runner has already *evaluated* is this cache,
 * and a module left in it keeps serving the old code. Returns whether the
 * runner had evaluated the file at all.
 */
export function invalidateFile(
  modules: EvaluatedModules,
  file: string,
): boolean {
  const seen = new Set<string>();
  function walk(id: string): void {
    if (seen.has(id)) return;
    seen.add(id);
    const node = modules.getModuleById(id);
    if (!node) return;
    modules.invalidateModule(node);
    for (const importer of node.importers) walk(importer);
  }
  const changed = modules.getModulesByFile(file);
  if (!changed) return false;
  for (const node of changed) walk(node.id);
  return true;
}

/** The module the dev server imports through the runner: the entry's exports. */
export interface DevEntry {
  readonly default: PlumixHandler;
}

export interface DevCommandOptions<Entry extends DevEntry> {
  /**
   * The server environment for the runtime the config names, read again on
   * each restart Vite makes. Its `entry` is what the runner imports.
   */
  readonly environment: (runtime: RuntimeAdapter) => ServerEnvironmentOptions;
  /**
   * Loads the project's env file into the process, first on start and again
   * on each restart, before the config is evaluated.
   */
  readonly loadEnv: (cwd: string) => void;
  /**
   * Serves the staged public tree from disk, ahead of Vite's own middlewares.
   * Vite answers `publicDir` from a listing taken once at `createServer` and
   * repaired by watcher events, and the admin shell is staged after that
   * listing, so under load a chunk can be missing from the set for the life
   * of the server; Vite then calls `next()`, and the dispatcher, seeing an
   * asset-shaped path at the root base, 404s it without reading the disk
   * (#2225).
   */
  readonly stagedFiles: (publicDir: string) => Connect.NextHandleFunction;
  /**
   * Builds what the last middleware answers with over the entry's `fetch`,
   * on the first request after start or after an edit the runner evaluated.
   */
  readonly site: (loaded: {
    readonly config: PlumixConfig;
    readonly entry: Entry;
    /** The staged public dir, where admin deep links resolve to the shell. */
    readonly publicDir: string;
  }) => Promise<LoadedSite>;
}

const SERVER_ENVIRONMENT = "server";

// The page a failed `buildApp` renders; small, so it is written whole.
async function respond(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(await response.text());
}

/**
 * The body of a self-hosted runtime's `plumix dev`: one Vite server whose
 * server environment is runnable, a loopback gate ahead of everything it
 * serves, and a last middleware into the entry's `fetch`, rebuilt on the first
 * request after an edit. Accepts `--port` and `--host`.
 */
export async function runDevCommand<Entry extends DevEntry>(
  ctx: CommandContext,
  options: DevCommandOptions<Entry>,
): Promise<void> {
  const { port, host } = parseDevArgs(ctx.argv);
  const reloader = createSiteReloader();
  // Set by `config` before `configureServer` reads it, on start and restart.
  let entryPath = "";

  async function loadSite(
    runner: ModuleRunner,
    publicDir: string,
  ): Promise<LoadedSite> {
    const config = (
      await runner.import<{ default: PlumixConfig }>(ctx.configPath)
    ).default;
    const entry = await runner.import<Entry>(entryPath);
    return options.site({ config, entry, publicDir });
  }

  // Requests waiting on a load that threw get the page a failed `buildApp`
  // renders.
  function bootFailure(error: unknown, logger: Logger): DevListener {
    logger.error(String(error), {
      error: error instanceof Error ? error : undefined,
    });
    return (_req, res) => {
      void respond(res, renderDevBootErrorResponse(error));
    };
  }

  const dev: Plugin = {
    name: "plumix:dev-command",
    // Runs at start and again on each restart Vite makes for a `.env` or
    // config edit, so everything the dev server derives from the project
    // sees the same environment: the file first, then a fresh config
    // evaluation for the emitted sources and the staged admin manifest —
    // the CLI's own evaluation, which the plugin would otherwise reuse,
    // predates the file.
    async config() {
      options.loadEnv(ctx.cwd);
      const { runtime } = await emitPlumixSources(ctx.cwd, ctx.configPath, {
        fresh: true,
      });
      const server = options.environment(runtime);
      entryPath = join(ctx.cwd, server.entry);
      return {
        environments: {
          [SERVER_ENVIRONMENT]: {
            ...serverEnvironment(server),
            // The runner evaluates ESM only, and `react` and friends ship
            // CommonJS; with everything inlined they have to be pre-bundled,
            // discovered from the entry as the Cloudflare plugin does for
            // its worker. A dependency first seen after start re-bundles
            // without failing the request that found it — the runner has no
            // page to reload. What the build leaves external stays out.
            optimizeDeps: {
              noDiscovery: false,
              ignoreOutdatedRequests: true,
              entries: normalizePath(entryPath),
              exclude: serverExternals(server),
            },
            dev: {
              // HMR stays off in the runner: invalidation is explicit, in
              // `hotUpdate`, rather than left to the runner's own client.
              createEnvironment: (name, config) =>
                createRunnableDevEnvironment(name, config, { hot: false }),
            },
          },
        },
      };
    },
    configureServer(server: ViteDevServer) {
      const environment = server.environments[SERVER_ENVIRONMENT];
      if (!environment || !isRunnableDevEnvironment(environment)) {
        // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
        throw new Error(
          `plumix dev: the "${SERVER_ENVIRONMENT}" environment is not runnable`,
        );
      }
      const { runner } = environment;
      // A restart hands over a new runner; nothing imported through the old
      // one may answer again.
      reloader.invalidate();

      // Ahead of everything Vite serves: a request from a host that is not
      // loopback gets no module source, no admin shell and no site.
      // `PLUMIX_DEV_ALLOW_REMOTE` is the documented opt-out.
      server.middlewares.use((req, res, next) => {
        if (isTrustedDevHost(req.headers.host)) {
          next();
          return;
        }
        res.statusCode = 403;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(
          "plumix dev answers loopback requests only; set PLUMIX_DEV_ALLOW_REMOTE=1 to open it up.\n",
        );
      });

      server.middlewares.use(options.stagedFiles(server.config.publicDir));

      // Returned, so it lands after Vite's own middlewares: module serving,
      // HMR and the staged admin shell answer first.
      return () => {
        const build = () => loadSite(runner, server.config.publicDir);
        const fail = (error: unknown) =>
          bootFailure(error, server.config.logger);
        server.middlewares.use((req, res) => {
          void reloader.current(build, fail).then((site) => site(req, res));
        });
      };
    },
    hotUpdate({ file }) {
      const environment = this.environment;
      if (
        environment.name !== SERVER_ENVIRONMENT ||
        !isRunnableDevEnvironment(environment)
      ) {
        return;
      }
      if (invalidateFile(environment.runner.evaluatedModules, file)) {
        reloader.invalidate();
      }
    },
  };

  const server = await createServer({
    configFile: false,
    root: ctx.cwd,
    // No `index.html` fallback: the entry answers every request Vite does not.
    appType: "custom",
    plugins: [dev, plumix({ configFile: ctx.configPath })],
    // `strictPort` when --port is explicit: an e2e harness points playwright
    // at the requested port and needs a fail-fast, not vite's silent
    // fallback to the next free one.
    server: { port, strictPort: port !== undefined, host },
  });
  await server.listen();
  server.printUrls();
}
