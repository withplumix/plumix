import { createBuilder } from "vite";

import type { CommandContext, RuntimeAdapter } from "@plumix/core";

import type { ServerEnvironmentOptions } from "./server-environment.js";
import { buildAppClientFirst } from "./build-order.js";
import { emitPlumixSources, plumix } from "./index.js";
import { serverEnvironment } from "./server-environment.js";

export interface BuildCommandOptions {
  /** The server environment for the runtime the config names. */
  readonly environment: (runtime: RuntimeAdapter) => ServerEnvironmentOptions;
}

/**
 * The body of a self-hosted runtime's `plumix build`: the plumix sources
 * emitted, then `dist/client` for the browser and the server bundle beside it.
 */
export async function runBuildCommand(
  ctx: CommandContext,
  options: BuildCommandOptions,
): Promise<void> {
  await emitPlumixSources(ctx.cwd, ctx.configPath);
  const builder = await createBuilder({
    configFile: false,
    root: ctx.cwd,
    plugins: [plumix({ configFile: ctx.configPath })],
    environments: {
      client: { build: { outDir: "dist/client" } },
      server: serverEnvironment(options.environment(ctx.app.config.runtime)),
    },
    // The server bakes the client's Vite manifest in, so the client goes first.
    builder: { buildApp: buildAppClientFirst },
  });
  await builder.buildApp();
}
