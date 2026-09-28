import type { CommandDefinition } from "plumix";

import { nodeServerEnvironment } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe:
    "Build the site: dist/client for the browser, dist/server to run with node",
  async run(ctx) {
    const { runBuildCommand } = await import("plumix/vite");
    await runBuildCommand(ctx, { environment: nodeServerEnvironment });
  },
};
