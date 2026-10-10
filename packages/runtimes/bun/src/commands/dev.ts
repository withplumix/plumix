import type { CommandDefinition } from "plumix";
import type { DevEntry } from "plumix/vite";

import type { BunSite } from "../site.js";
import { bun, isBunRuntime } from "../adapter.js";
import { ASSETS_DIR_ENV, PROJECT_ROOT_ENV } from "../entry-constants.js";
import { createAssetsLayer } from "../http/assets.js";
import { createImageLayer } from "../http/images.js";
import { createDevMiddleware } from "./node-bridge.js";
import { bunServerEnvironment } from "./vite.js";

type BunDevEntry = DevEntry & Partial<Pick<BunSite, "dispose">>;

export const devCommand: CommandDefinition = {
  describe: "Start the dev server (vite). Accepts --port and --host.",
  // A config failure then renders the dev boot-error page instead of aborting
  // before the server is up.
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
        // path opens the file `plumix migrate` wrote.
        const env = {
          ...process.env,
          [ASSETS_DIR_ENV]: publicDir,
          [PROJECT_ROOT_ENV]: ctx.cwd,
        };
        const fetch = (request: Request, clientAddress: string | undefined) =>
          entry.default.fetch(request, { env, clientAddress });
        // As in the built site: a same-origin image source is a public file
        // Vite would serve, else the site, as an anonymous GET.
        const images = createImageLayer(config.imageDelivery, {
          assets: createAssetsLayer({ root: publicDir }),
          basePath: config.basePath,
          fetch,
        });
        const listener = createDevMiddleware(
          async (request, clientAddress) =>
            (await images.serve(request, clientAddress)) ??
            fetch(request, clientAddress),
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
