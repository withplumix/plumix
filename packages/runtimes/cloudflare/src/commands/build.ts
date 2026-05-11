import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe: "Build the Worker bundle",
  async run(ctx) {
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx);

    const builder = await vite.createBuilder({
      configFile: false,
      root,
      plugins,
    });
    await builder.buildApp();
  },
};
