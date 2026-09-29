import type { CommandDefinition } from "plumix";
import type { DevEntry } from "plumix/vite";

import type { BunSite } from "../site.js";
import { bun, isBunRuntime } from "../adapter.js";
import { ASSETS_DIR_ENV, PROJECT_ROOT_ENV } from "../entry-constants.js";
import { createAssetsLayer } from "../http/assets.js";
import { createDevMiddleware } from "./node-bridge.js";
import { bunServerEnvironment } from "./vite.js";

type BunDevEntry = DevEntry & Partial<Pick<BunSite, "dispose">>;

export const devCommand: CommandDefinition = {
  describe: "Start the dev server (vite). Accepts --port and --host.",
  // The entry builds the app itself, inside the runner, so a config or
  // registration failure renders the dev boot-error page in the browser
  // instead of aborting the terminal before the server is up.
  deferApp: true,
  async run(ctx) {
    const { runDevCommand } = await import("plumix/vite");

    await runDevCommand<BunDevEntry>(ctx, {
      environment: bunServerEnvironment,
      stagedFiles: (root) => {
        const assets = createAssetsLayer({ root });
        return createDevMiddleware((request) => assets.serve(request), {
          trustProxy: false,
        });
      },
      site({ config, entry, publicDir }) {
        const { trustProxy } = isBunRuntime(config.runtime)
          ? config.runtime.config
          : bun().config;
        // The staged public dir, so admin deep links resolve to the shell
        // Vite also serves; the project root, so a relative `bunSqlite()`
        // path opens the file `migrate apply` wrote.
        const env = {
          ...process.env,
          [ASSETS_DIR_ENV]: publicDir,
          [PROJECT_ROOT_ENV]: ctx.cwd,
        };
        const listener = createDevMiddleware(
          (request, clientAddress) =>
            entry.default.fetch(request, { env, clientAddress }),
          { trustProxy },
        );
        return Promise.resolve({
          listener: (req, res) => listener(req, res),
          dispose: entry.dispose,
        });
      },
    });
  },
};
