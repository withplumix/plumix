import type { CommandDefinition } from "plumix";

import { loadPlumixVite, nodeServerEnvironment } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe:
    "Build the site: dist/client for the browser, dist/server to run with node",
  async run(ctx) {
    const { runBuildCommand } = await loadPlumixVite();
    await runBuildCommand(ctx, { environment: nodeServerEnvironment });
  },
};
