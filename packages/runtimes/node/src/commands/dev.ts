import { join } from "node:path";
import type { CommandDefinition, PlumixConfig, PlumixHandler } from "plumix";
import type { Plugin } from "vite";
import type { EvaluatedModules, ModuleRunner } from "vite/module-runner";
import { isTrustedDevHost, renderDevBootErrorResponse } from "plumix";

import type { RequestListener } from "../http/bridge.js";
import { isNodeRuntime } from "../adapter.js";
import { ASSETS_DIR_ENV } from "../entry-constants.js";
import { createRequestListener } from "../http/bridge.js";
import { createDotenvLoader } from "./dotenv.js";
import { ENTRY_FILE, serverEnvironment, serverExternals } from "./vite.js";

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

const SERVER_ENVIRONMENT = "server";

export const devCommand: CommandDefinition = {
  describe: "Start the dev server (vite). Accepts --port and --host.",
  // The entry builds the app itself, inside the runner, so a config or
  // registration failure renders the dev boot-error page in the browser
  // instead of aborting the terminal before the server is up.
  deferApp: true,
  async run(ctx) {
    const { port, host } = parseDevArgs(ctx.argv);
    const vite = await import("vite");
    const { emitPlumixSources, plumix } = await import("plumix/vite");
    const entryPath = join(ctx.cwd, ENTRY_FILE);
    const loadDotenv = createDotenvLoader();
    // The bridge into the entry, imported through the runner on the first
    // request after start, a restart, or an edit that invalidated it.
    let listener: Promise<RequestListener> | undefined;

    async function load(
      runner: ModuleRunner,
      publicDir: string,
      logger: { error(message: string, options: { error?: Error }): void },
    ): Promise<RequestListener> {
      try {
        const config = (
          await runner.import<{ default: PlumixConfig }>(ctx.configPath)
        ).default;
        const entry = await runner.import<{ default: PlumixHandler }>(
          entryPath,
        );
        const { trustProxy, bodySizeLimit } = isNodeRuntime(config.runtime)
          ? config.runtime.config
          : {};
        // Points at the staged public dir so admin deep links resolve to the
        // shell Vite also serves.
        const env = { ...process.env, [ASSETS_DIR_ENV]: publicDir };
        return createRequestListener(
          async (request, meta) =>
            entry.default.fetch(request, {
              env,
              clientAddress: meta.clientAddress,
            }),
          { trustProxy, bodySizeLimit },
        );
      } catch (error) {
        // The entry could not even be imported — a config that fails to parse
        // or throws on load. This request gets the page a failed `buildApp`
        // renders; the next one tries again.
        listener = undefined;
        logger.error(String(error), {
          error: error instanceof Error ? error : undefined,
        });
        return createRequestListener(() =>
          Promise.resolve(renderDevBootErrorResponse(error)),
        );
      }
    }

    const nodeDev: Plugin = {
      name: "plumix-node:dev",
      // Runs at start and again on each restart Vite makes for a `.env` or
      // config edit, so everything the dev server derives from the project
      // sees the same environment: the file first, then a fresh config
      // evaluation for the emitted sources and the staged admin manifest —
      // the CLI's own evaluation, which the plugin would otherwise reuse,
      // predates the file.
      async config() {
        loadDotenv(join(ctx.cwd, ".env"));
        const { runtime } = await emitPlumixSources(ctx.cwd, ctx.configPath, {
          fresh: true,
        });
        const build = isNodeRuntime(runtime)
          ? (runtime.config.build ?? {})
          : {};
        return {
          environments: {
            [SERVER_ENVIRONMENT]: {
              ...serverEnvironment(build),
              // The runner evaluates ESM only, and `react` and friends ship
              // CommonJS; with everything inlined they have to be pre-bundled,
              // discovered from the entry as the Cloudflare plugin does for
              // its worker. A dependency first seen after start re-bundles
              // without failing the request that found it — the runner has no
              // page to reload. What the build leaves external stays out.
              optimizeDeps: {
                noDiscovery: false,
                ignoreOutdatedRequests: true,
                entries: vite.normalizePath(entryPath),
                exclude: serverExternals(build),
              },
              dev: {
                // HMR stays off in the runner: invalidation is explicit, in
                // `hotUpdate`, rather than left to the runner's own client.
                createEnvironment: (name, config) =>
                  vite.createRunnableDevEnvironment(name, config, {
                    hot: false,
                  }),
              },
            },
          },
        };
      },
      configureServer(server) {
        const environment = server.environments[SERVER_ENVIRONMENT];
        if (!environment || !vite.isRunnableDevEnvironment(environment)) {
          // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
          throw new Error(
            `plumix dev: the "${SERVER_ENVIRONMENT}" environment is not runnable`,
          );
        }
        const { runner } = environment;
        // A restart hands over a new runner; nothing imported through the old
        // one may answer again.
        listener = undefined;

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

        // Returned, so it lands after Vite's own middlewares: module serving,
        // HMR and the staged admin shell answer first.
        return () => {
          server.middlewares.use((req, res) => {
            void (listener ??= load(
              runner,
              server.config.publicDir,
              server.config.logger,
            )).then((bridge) => bridge(req, res));
          });
        };
      },
      hotUpdate({ file }) {
        const environment = this.environment;
        if (
          environment.name !== SERVER_ENVIRONMENT ||
          !vite.isRunnableDevEnvironment(environment)
        ) {
          return;
        }
        if (invalidateFile(environment.runner.evaluatedModules, file)) {
          listener = undefined;
        }
      },
    };

    const server = await vite.createServer({
      configFile: false,
      root: ctx.cwd,
      // No `index.html` fallback: the entry answers every request Vite does not.
      appType: "custom",
      plugins: [nodeDev, plumix({ configFile: ctx.configPath })],
      // `strictPort` when --port is explicit: an e2e harness points playwright
      // at the requested port and needs a fail-fast, not vite's silent
      // fallback to the next free one.
      server: { port, strictPort: port !== undefined, host },
    });
    await server.listen();
    server.printUrls();
  },
};
