import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

/**
 * Minimal slice of Vite's `ViteBuilder` this orchestration touches, so the
 * ordering invariant can be unit-tested without booting a real build.
 */
interface BuildableApp {
  readonly environments: Record<string, unknown>;
  build(environment: unknown): Promise<unknown>;
}

/**
 * Build the client environment before the worker, then install this as Vite's
 * `builder.buildApp`. The worker bakes `virtual:plumix/asset-manifest` from the
 * client's Vite manifest, so the client must build first or the worker ships no
 * theme CSS on a cold build (#528).
 *
 * This replaces `@cloudflare/vite-plugin`'s default `buildApp`, which builds the
 * worker first and *then* rebuilds the client — a redundant third transform
 * pass (#1205). Its `order:"post"` hook still runs afterwards to write
 * `wrangler.json` and skips already-built envs. Dropping the default rests on
 * two plumix invariants: the worker imports no static assets (nothing for CF's
 * worker→client asset-move to relocate — this is why the output is unchanged),
 * and there is a single non-`devOnly` worker (so a plain loop over the
 * non-client envs stands in for CF's parallel, `devOnly`-filtered build).
 */
export async function buildAppClientFirst(
  builder: BuildableApp,
): Promise<void> {
  const client = builder.environments.client;
  if (client) await builder.build(client);
  for (const [name, environment] of Object.entries(builder.environments)) {
    if (name === "client") continue;
    await builder.build(environment);
  }
}

export const buildCommand: CommandDefinition = {
  describe: "Build the Worker bundle",
  async run(ctx) {
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx);

    const builder = await vite.createBuilder({
      configFile: false,
      root,
      plugins,
      // CF's config hook honours a user-provided `builder.buildApp`, so this
      // swaps in our client-first ordering (see `buildAppClientFirst`).
      builder: { buildApp: buildAppClientFirst },
    });

    await builder.buildApp();
  },
};
