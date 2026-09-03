import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe: "Build the Worker bundle",
  async run(ctx) {
    const vite = await import("vite");
    const { buildAppClientFirst } = await import("plumix/vite");
    const { plugins, root } = await createCloudflareVite(ctx);

    const builder = await vite.createBuilder({
      configFile: false,
      root,
      plugins,
      // CF's config hook honours a user-provided `builder.buildApp`. Its
      // `order:"post"` hook still writes `wrangler.json` afterwards and skips
      // already-built envs; the worker imports no static assets, so CF's
      // worker→client asset-move has nothing to relocate and the output is
      // unchanged.
      builder: { buildApp: buildAppClientFirst },
    });

    await builder.buildApp();
  },
};
