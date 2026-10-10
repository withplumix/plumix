import type { CommandDefinition } from "plumix";
import type { DevEntry } from "plumix/vite";

import type { RequestHandler } from "../http/bridge.js";
import type { NodeSite } from "../site.js";
import { isNodeRuntime } from "../adapter.js";
import { ASSETS_DIR_ENV } from "../entry-constants.js";
import { createAssetsLayer } from "../http/assets.js";
import { createRequestListener } from "../http/bridge.js";
import { createImageLayer } from "../http/images.js";
import { nodeServerEnvironment } from "./vite.js";

type NodeDevEntry = DevEntry & Partial<Pick<NodeSite, "startCron" | "dispose">>;

export const devCommand: CommandDefinition = {
  describe: "Start the dev server (vite). Accepts --port and --host.",
  // A config failure then renders the dev boot-error page instead of aborting
  // before the server is up.
  deferApp: true,
  async run(ctx) {
    const { runDevCommand } = await import("plumix/vite");

    await runDevCommand<NodeDevEntry>(ctx, {
      environment: nodeServerEnvironment,
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
        // Dev is one process, so serialising is guard enough: the minutes-long
        // lease would outlive a restart and make cron look dead.
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
