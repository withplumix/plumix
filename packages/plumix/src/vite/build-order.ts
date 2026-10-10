import type { ViteBuilder } from "vite";

// Named after `ViteBuilder.build` so the real builder stays assignable; `void`
// lets a test double resolve nothing.
type BuildResult = Awaited<ReturnType<ViteBuilder["build"]>> | void;

// Not JSON: they are the builder's own live objects, only read by name.
type ViteEnvironments = Record<string, unknown>;

export interface BuildableApp {
  readonly environments: ViteEnvironments;
  build(environment: unknown): Promise<BuildResult>;
}

/**
 * The server bundle bakes the client's Vite manifest, so the client must build
 * first or a cold build ships no theme CSS. Vite's default order differs.
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
