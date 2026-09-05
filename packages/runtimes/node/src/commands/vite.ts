import type { EnvironmentOptions } from "vite";

import type { NodeConfig } from "../adapter.js";

// Compiled addons the bundler cannot carry; each is one a site may install.
const NATIVE_EXTERNALS: readonly string[] = [
  "sharp",
  "better-sqlite3",
  "@libsql/client",
  "@libsql/core",
  "@libsql/hrana-client",
  "@libsql/isomorphic-fetch",
  "@libsql/isomorphic-ws",
  "libsql",
];

/** The entry the plumix Vite plugin emits, relative to the project root. */
export const ENTRY_FILE = ".plumix/worker.ts";

/** What the server bundle imports at runtime instead of inlining. */
export function serverExternals(
  build: NonNullable<NodeConfig["build"]>,
): string[] {
  return [...NATIVE_EXTERNALS, ...(build.external ?? [])];
}

/**
 * The environment `plumix build` bundles the entry in, beside the client's
 * `dist/client`. Everything is inlined: the SSR island transform only wraps
 * modules Vite processes, and under pnpm an externalized transitive dependency
 * of `plumix` is unresolvable from an app root.
 */
export function serverEnvironment(
  build: NonNullable<NodeConfig["build"]>,
): EnvironmentOptions {
  return {
    consumer: "server",
    resolve: {
      noExternal: true,
      external: serverExternals(build),
    },
    build: {
      outDir: "dist/server",
      // Vite copies `publicDir` — the staged admin shell — into every
      // environment's output by default; the server bundle has no use for it.
      copyPublicDir: false,
      rolldownOptions: {
        input: ENTRY_FILE,
        output: { entryFileNames: "worker.js" },
      },
    },
  };
}
