import type { CommandDefinition } from "@plumix/core";

import { spawnInherit } from "./spawn.js";

export const deployCommand: CommandDefinition = {
  describe: "Deploy to Cloudflare (via wrangler)",
  async run(ctx) {
    await spawnInherit("wrangler", ["deploy", ...ctx.argv], { cwd: ctx.cwd });
  },
};
