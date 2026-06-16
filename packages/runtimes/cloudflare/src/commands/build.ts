import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

export const buildCommand: CommandDefinition = {
  describe: "Build the Worker bundle",
  async run(ctx) {
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx);

    const builder = await vite.createBuilder({
      configFile: false,
      root,
      plugins,
    });

    // Build the client environment first so its Vite asset manifest exists
    // before the worker environment bakes `virtual:plumix/asset-manifest`.
    // @cloudflare/vite-plugin's `buildApp` builds the worker env before the
    // client, so on a cold build (CI) the worker would otherwise bake an
    // empty manifest and ship no theme CSS (#528). Client builds are
    // content-hashed and deterministic, so the manifest read here matches
    // the assets `buildApp` re-emits.
    const clientEnv = builder.environments.client;
    if (clientEnv) {
      await builder.build(clientEnv);
    }
    await builder.buildApp();
  },
};
