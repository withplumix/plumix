import type { CommandDefinition } from "@plumix/core";
import { spawnInherit } from "@plumix/core";

export const typesCommand: CommandDefinition = {
  describe: "Generate Worker binding types (via wrangler)",
  async run(ctx) {
    await spawnInherit("wrangler", ["types", ...ctx.argv], { cwd: ctx.cwd });
  },
};
