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
      // CF's `order:"post"` hook still writes `wrangler.json` and skips
      // already-built envs, so the output is unchanged.
      builder: { buildApp: buildAppClientFirst },
    });

    await builder.buildApp();
  },
};
