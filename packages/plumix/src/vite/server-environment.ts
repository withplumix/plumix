import type { EnvironmentOptions } from "vite";

/** Compiled addons the bundler cannot carry; each is one a site may install. */
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

export interface ServerEnvironmentOptions {
  /** The module the environment bundles, relative to the project root. */
  readonly entry: string;
  /** Where `worker.js` lands, beside the client's `dist/client`. */
  readonly outDir: string;
  /**
   * What the bundle imports at runtime instead of inlining, beside the shared
   * native packages: the runtime's own, then the site's `build.external`.
   */
  readonly external?: readonly string[];
  /** Export conditions to resolve with, in place of Vite's server defaults. */
  readonly conditions?: readonly string[];
}

/** What the server bundle imports at runtime instead of inlining. */
export function serverExternals(options: ServerEnvironmentOptions): string[] {
  return [...NATIVE_EXTERNALS, ...(options.external ?? [])];
}

/**
 * Everything is inlined: the island transform only wraps modules Vite
 * processes, and under pnpm a transitive dependency of `plumix` is
 * unresolvable from an app root.
 */
export function serverEnvironment(
  options: ServerEnvironmentOptions,
): EnvironmentOptions {
  return {
    consumer: "server",
    resolve: {
      noExternal: true,
      external: serverExternals(options),
      ...(options.conditions && { conditions: [...options.conditions] }),
    },
    build: {
      outDir: options.outDir,
      // Vite copies `publicDir` — the staged admin shell — into every
      // environment's output by default; the server bundle has no use for it.
      copyPublicDir: false,
      rolldownOptions: {
        input: options.entry,
        output: { entryFileNames: "worker.js" },
      },
    },
  };
}
