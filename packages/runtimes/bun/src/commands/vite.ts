import type { RuntimeAdapter } from "plumix";
import type { ServerEnvironmentOptions } from "plumix/vite";
import { loadOnce } from "plumix/support";

import { isBunRuntime } from "../adapter.js";

/** Loaded on first use, so a command that never builds skips Vite. */
export const loadPlumixVite = loadOnce(() => import("plumix/vite"));

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
