import type { CommandDefinition } from "plumix";
import { spawnInherit } from "plumix/cli";

export const deployCommand: CommandDefinition = {
  describe: "Deploy to Cloudflare (via wrangler)",
  async run(ctx) {
    await spawnInherit("wrangler", ["deploy", ...ctx.argv], { cwd: ctx.cwd });
  },
};
