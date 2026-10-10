import type { RuntimeAdapter } from "plumix";
import type { ServerEnvironmentOptions } from "plumix/vite";

import { isBunRuntime } from "../adapter.js";

/**
 * No `bun` export condition: it pulls React's Bun-only server build (Nitro
 * #4259), so the bundle resolves with Vite's server defaults.
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
