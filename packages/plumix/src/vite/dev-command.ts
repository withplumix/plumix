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
import { PlumixCliError } from "../cli/errors.js";
import { parsePortFlag } from "../cli/port-flag.js";
import { createDotenvLoader } from "./dotenv.js";
import { emitPlumixSources, plumix } from "./index.js";
import { serverEnvironment, serverExternals } from "./server-environment.js";
import { createSiteReloader } from "./site-reloader.js";

interface DevArgs {
  readonly port?: number;
  readonly host?: string | true;
}

export function parseDevArgs(argv: readonly string[]): DevArgs {
  const args: { port?: number; host?: string | true } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--port") {
      args.port = parsePortFlag("--port", argv[i + 1]);
      i += 1;
      continue;
    }
    if (token?.startsWith("--port=")) {
      args.port = parsePortFlag("--port", token.slice("--port=".length));
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
      if (raw === "") throw PlumixCliError.devHostEmpty();
      args.host = raw;
      continue;
    }
  }
  return args;
}

/**
 * Vite's module graph governs only what the server transforms; a module left
 * in the runner's evaluated cache keeps serving old code. Returns whether the
 * runner had evaluated the file.
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

/**
 * The module the dev server imports through the runner: the entry's exports.
 */
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
   * Runs ahead of Vite's middlewares: Vite's `publicDir` listing predates the
   * admin staging, so a chunk can stay missing for the server's life.
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
 * Rebuilds the entry on the first request after an edit. Accepts `--port` and
 * `--host`.
 */
export async function runDevCommand<Entry extends DevEntry>(
  ctx: CommandContext,
  options: DevCommandOptions<Entry>,
): Promise<void> {
  const { port, host } = parseDevArgs(ctx.argv);
  const reloader = createSiteReloader();
  // `.env` is every self-hosted runtime's env file, and the shell wins over it.
  const loadDotenv = createDotenvLoader();
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
    // Reruns on each `.env` or config restart; the CLI's own config evaluation
    // predates the file.
    async config() {
      loadDotenv(join(ctx.cwd, ".env"));
      const { runtime } = await emitPlumixSources(ctx.cwd, ctx.configPath, {
        fresh: true,
      });
      const server = options.environment(runtime);
      entryPath = join(ctx.cwd, server.entry);
      return {
        environments: {
          [SERVER_ENVIRONMENT]: {
            ...serverEnvironment(server),
            // The runner evaluates ESM only and `react` ships CommonJS, so
            // inlined deps must be pre-bundled, discovered from the entry.
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
        throw PlumixCliError.devEnvironmentNotRunnable({
          environment: SERVER_ENVIRONMENT,
        });
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
