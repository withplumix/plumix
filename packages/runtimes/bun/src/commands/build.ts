import type { CommandDefinition } from "plumix";

import { bunServerEnvironment, loadPlumixVite } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe:
    "Build the site: dist/client for the browser, dist/server to run with bun",
  async run(ctx) {
    const { runBuildCommand } = await loadPlumixVite();
    await runBuildCommand(ctx, { environment: bunServerEnvironment });
  },
};
