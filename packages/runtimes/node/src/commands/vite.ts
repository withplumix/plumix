import type { RuntimeAdapter } from "plumix";
import type { ServerEnvironmentOptions } from "plumix/vite";
import { loadOnce } from "plumix/support";

import { isNodeRuntime } from "../adapter.js";

/** Loaded on first use, so a command that never builds skips Vite. */
export const loadPlumixVite = loadOnce(() => import("plumix/vite"));

/**
 * The Node server bundle: the emitted entry as `dist/server/worker.js`, with
 * the site's `build.external` left for node to import at runtime.
 */
export function nodeServerEnvironment(
  runtime: RuntimeAdapter,
): ServerEnvironmentOptions {
  const build = isNodeRuntime(runtime) ? (runtime.config.build ?? {}) : {};
  return {
    entry: ".plumix/worker.ts",
    outDir: "dist/server",
    external: build.external,
  };
}
