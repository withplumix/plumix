import { join } from "node:path";
import type { CommandDefinition } from "plumix";
import type { DevEntry } from "plumix/vite";

import type { RequestHandler } from "../http/bridge.js";
import type { NodeSite } from "../site.js";
import { isNodeRuntime } from "../adapter.js";
import { ASSETS_DIR_ENV } from "../entry-constants.js";
import { createAssetsLayer } from "../http/assets.js";
import { createRequestListener } from "../http/bridge.js";
import { createImageLayer } from "../http/images.js";
import { createDotenvLoader } from "./dotenv.js";
import { nodeServerEnvironment } from "./vite.js";

type NodeDevEntry = DevEntry & Partial<Pick<NodeSite, "startCron" | "dispose">>;

export const devCommand: CommandDefinition = {
  describe: "Start the dev server (vite). Accepts --port and --host.",
  // The entry builds the app itself, inside the runner, so a config or
  // registration failure renders the dev boot-error page in the browser
  // instead of aborting the terminal before the server is up.
  deferApp: true,
  async run(ctx) {
    const { runDevCommand } = await import("plumix/vite");
    const loadDotenv = createDotenvLoader();

    await runDevCommand<NodeDevEntry>(ctx, {
      environment: nodeServerEnvironment,
      loadEnv: (cwd) => loadDotenv(join(cwd, ".env")),
      stagedFiles: (root) => createAssetsLayer({ root }).serve,
      async site({ config, entry, publicDir }) {
        const { trustProxy, bodySizeLimit } = isNodeRuntime(config.runtime)
          ? config.runtime.config
          : {};
        // Points at the staged public dir so admin deep links resolve to the
        // shell Vite also serves.
        const env = { ...process.env, [ASSETS_DIR_ENV]: publicDir };
        const fetch: RequestHandler = async (request, meta) =>
          entry.default.fetch(request, {
            env,
            clientAddress: meta.clientAddress,
          });
        const bridge = createRequestListener(fetch, {
          trustProxy,
          bodySizeLimit,
        });
        // As in the built entry: a same-origin image source is a public file
        // Vite would serve, else the site, as an anonymous GET.
        const images = createImageLayer(config.imageDelivery, {
          assets: createAssetsLayer({ root: publicDir }),
          trustProxy,
          basePath: config.basePath,
          fetch,
        });
        // Dev is one process, so serialising the loop is guard enough; the
        // lease is sized in minutes and would outlive a process that restarts
        // every few seconds, leaving cron looking dead for the session. The
        // claim row still stops a reload replaying a minute.
        const scheduler =
          isNodeRuntime(config.runtime) && config.runtime.config.cron !== false
            ? await entry.startCron?.({ lease: false })
            : undefined;
        return {
          listener: (req, res) =>
            images.serve(req, res, () => bridge(req, res)),
          scheduler,
          dispose: entry.dispose,
        };
      },
    });
  },
};
