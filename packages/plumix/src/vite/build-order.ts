import type { ViteBuilder } from "vite";

/**
 * Minimal slice of Vite's `ViteBuilder` this orchestration touches, so the
 * ordering invariant can be unit-tested without booting a real build. The
 * result is Vite's to define and nothing here reads it — naming it after
 * `ViteBuilder.build` is what keeps the real builder assignable, while `void`
 * leaves a test double free to resolve nothing.
 */
type BuildResult = Awaited<ReturnType<ViteBuilder["build"]>> | void;

/** Vite's live `Environment` instances, keyed by name. Not JSON: they are the
 *  builder's own objects, and this signature only reads them by name. */
type ViteEnvironments = Record<string, unknown>;

export interface BuildableApp {
  readonly environments: ViteEnvironments;
  build(environment: unknown): Promise<BuildResult>;
}

/**
 * Build the client environment before every server environment, for a
 * runtime's build command to install as Vite's `builder.buildApp`. The server
 * bundle bakes `virtual:plumix/asset-manifest` from the client's Vite
 * manifest, so the client must build first or the server ships no theme CSS
 * on a cold build (#528). Nothing pins that order otherwise: Vite's default
 * `buildApp` walks `environments` in declaration order, and
 * `@cloudflare/vite-plugin`'s builds the worker first and then rebuilds the
 * client — a redundant third transform pass (#1205). A plain loop over the
 * non-client envs is enough because plumix has a single production server
 * environment.
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
