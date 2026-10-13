import { join } from "node:path";
import { createBuilder } from "vite";

import type { CommandContext, RuntimeAdapter } from "@plumix/core";

import type { ServerEnvironmentOptions } from "./server-environment.js";
import { copyOwnerHistories } from "../cli/migrate/built.js";
import { buildAppClientFirst } from "./build-order.js";
import { buildDataMigrations } from "./data-migrations-bundle.js";
import { emitPlumixSources, plumix } from "./index.js";
import { serverEnvironment } from "./server-environment.js";

export interface BuildCommandOptions {
  /** The server environment for the runtime the config names. */
  readonly environment: (runtime: RuntimeAdapter) => ServerEnvironmentOptions;
}

/**
 * A self-hosted runtime's `plumix build`: the plumix sources emitted, then
 * `dist/client`, the server bundle beside it, and the histories and data
 * migrations it applies.
 */
export async function runBuildCommand(
  ctx: CommandContext,
  options: BuildCommandOptions,
): Promise<void> {
  await emitPlumixSources(ctx.cwd, ctx.configPath);
  const server = options.environment(ctx.app.config.runtime);
  const builder = await createBuilder({
    configFile: false,
    root: ctx.cwd,
    plugins: [plumix({ configFile: ctx.configPath })],
    environments: {
      client: { build: { outDir: "dist/client" } },
      server: serverEnvironment(server),
    },
    // The server bakes the client's Vite manifest in, so the client goes first.
    builder: { buildApp: buildAppClientFirst },
  });
  await builder.buildApp();
  const site = {
    cwd: ctx.cwd,
    configPath: ctx.configPath,
    config: ctx.app.config,
  };
  copyOwnerHistories(site, join(ctx.cwd, server.outDir));
  await buildDataMigrations(site, server);
}
