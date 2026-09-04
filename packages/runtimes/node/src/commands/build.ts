import type { CommandDefinition } from "plumix";

import { isNodeRuntime } from "../adapter.js";
import { serverEnvironment } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe:
    "Build the site: dist/client for the browser, dist/server to run with node",
  async run(ctx) {
    const vite = await import("vite");
    const { buildAppClientFirst, emitPlumixSources, plumix } =
      await import("plumix/vite");
    await emitPlumixSources(ctx.cwd, ctx.configPath);
    const runtime = ctx.app.config.runtime;
    const build = isNodeRuntime(runtime) ? (runtime.config.build ?? {}) : {};

    const builder = await vite.createBuilder({
      configFile: false,
      root: ctx.cwd,
      plugins: [plumix({ configFile: ctx.configPath })],
      environments: {
        client: { build: { outDir: "dist/client" } },
        server: serverEnvironment(build),
      },
      // The server bakes the client's Vite manifest in, so the client goes first.
      builder: { buildApp: buildAppClientFirst },
    });
    await builder.buildApp();
  },
};
