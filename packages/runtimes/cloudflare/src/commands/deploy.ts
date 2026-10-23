import type { CommandContext, CommandDefinition } from "plumix/cli";
import { migrateBeforeDeploy, spawnInherit } from "plumix/cli";

import { buildCommand } from "./build.js";
import { CloudflareCliError } from "./errors.js";

interface ShipArgs {
  readonly env: string | undefined;
  readonly rest: readonly string[];
}

/** `--env` is Plumix's; every other argument is wrangler's. */
function parseShipArgs(argv: readonly string[]): ShipArgs {
  let env: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (token === "--env") {
      env = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith("--env=")) {
      env = token.slice("--env=".length);
      continue;
    }
    rest.push(token);
  }
  return { env, rest };
}

/** The environment a ship builds for: `--env`, else `CLOUDFLARE_ENV`, as in wrangler. */
function shipEnvironment(flag: string | undefined): string | undefined {
  const ambient = process.env.CLOUDFLARE_ENV;
  const set = ambient === undefined || ambient === "" ? undefined : ambient;
  if (flag !== undefined && set !== undefined && flag !== set) {
    throw CloudflareCliError.deployEnvConflict({ flag, ambient: set });
  }
  return flag ?? set;
}

/** `@cloudflare/vite-plugin` reads the environment it builds for from `CLOUDFLARE_ENV`. */
async function buildFor(
  ctx: CommandContext,
  env: string | undefined,
): Promise<void> {
  const previous = process.env.CLOUDFLARE_ENV;
  if (env !== undefined) process.env.CLOUDFLARE_ENV = env;
  try {
    await deployDeps.build({ ...ctx, argv: [] });
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_ENV;
    else process.env.CLOUDFLARE_ENV = previous;
  }
}

function shipCommand(
  wranglerCommand: "deploy" | "preview",
  describe: string,
): CommandDefinition {
  const preview = wranglerCommand === "preview";
  return {
    describe,
    async run(ctx) {
      const args = parseShipArgs(ctx.argv);
      const env = shipEnvironment(args.env);
      await buildFor(ctx, env);
      await migrateBeforeDeploy(ctx, {
        ...(env === undefined ? { production: true } : { env }),
        ...(preview ? { preview: true } : {}),
      });
      await deployDeps.spawnInherit(
        "wrangler",
        [
          wranglerCommand,
          ...(env === undefined ? [] : ["--env", env]),
          ...args.rest,
        ],
        {
          cwd: ctx.cwd,
          ...(env === undefined ? {} : { env: { CLOUDFLARE_ENV: env } }),
        },
      );
    },
  };
}

export const deployCommand: CommandDefinition = shipCommand(
  "deploy",
  "Build, apply pending migrations to the environment's D1, then deploy it (via wrangler); any other options go to wrangler deploy",
);

export const previewCommand: CommandDefinition = shipCommand(
  "preview",
  "Build, apply pending migrations to the Worker Previews D1, then create a Preview (via wrangler); any other options go to wrangler preview",
);

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const deployDeps = {
  build: async (ctx: CommandContext): Promise<void> => {
    await buildCommand.run(ctx);
  },
  spawnInherit,
};
