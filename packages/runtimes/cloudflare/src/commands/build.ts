import type { CommandDefinition } from "@plumix/core";

import { createCloudflareVite } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe: "Build the Worker bundle",
  async run(ctx) {
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx);

    await vite.build({
      configFile: false,
      root,
      plugins,
    });
  },
};
