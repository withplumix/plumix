import type { RuntimeAdapter } from "plumix";
import type { ServerEnvironmentOptions } from "plumix/vite";

import { isBunRuntime } from "../adapter.js";

/**
 * The Bun server bundle: the emitted entry as `dist/server/worker.js`, with
 * the site's `build.external` left for Bun to import at runtime. Vite's
 * server environment already leaves every `bun:` module external. No `bun`
 * export condition: it pulls React's Bun-only server build (Nitro #4259),
 * so the bundle resolves with Vite's server defaults.
 */
export function bunServerEnvironment(
  runtime: RuntimeAdapter,
): ServerEnvironmentOptions {
  const build = isBunRuntime(runtime) ? (runtime.config.build ?? {}) : {};
  return {
    entry: ".plumix/worker.ts",
    outDir: "dist/server",
    external: build.external,
  };
}
