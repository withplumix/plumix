import type { CommandDefinition } from "plumix/cli";
import { migrateBeforeDeploy, spawnInherit } from "plumix/cli";

export const deployCommand: CommandDefinition = {
  describe:
    "Apply pending migrations to the remote D1, then deploy to Cloudflare (via wrangler)",
  async run(ctx) {
    await migrateBeforeDeploy(ctx);
    await deployDeps.spawnInherit("wrangler", ["deploy", ...ctx.argv], {
      cwd: ctx.cwd,
    });
  },
};

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const deployDeps = {
  spawnInherit,
};
