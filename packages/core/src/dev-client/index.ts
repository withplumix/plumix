// Import only browser-safe `dev/ui` code here, never core server internals, so
// this subpath carries no `node:async_hooks` into the client bundle.

import type { HmrClient, InstallOptions } from "../dev/ui/index.js";
import {
  installCompileErrorOverlay,
  installIslandErrorOverlay,
  installTerminalForwarding,
  parseForwardLevel,
} from "../dev/ui/index.js";

export type { HmrClient, ViteErrorPayload } from "../dev/ui/index.js";

// The plumix Vite plugin serves these endpoints, so it shares the contract.
export {
  DEV_ERROR_CLIENT_ERRORS_ENDPOINT,
  DEV_ERROR_SOURCE_ENDPOINT,
  DEV_ERROR_STACK_ENDPOINT,
  DEV_ERROR_TERMINAL_ENDPOINT,
} from "../dev/ui/index.js";
export type { DevErrorFrame, ForwardedLog } from "../dev/ui/index.js";

export interface DevClientOptions {
  /** Without it the compile/import error overlay is not installed. */
  readonly hot?: HmrClient;
  /**
   * A `vite:error` that fired before this lazy install loaded. Vite's own
   * overlay is disabled, so without the replay the error is lost.
   */
  readonly initialCompileError?: InstallOptions["initialError"];
}

/** One piece of the dev client, and how to install it. */
export interface DevClientPart {
  readonly name: "island-overlay" | "terminal-forwarding" | "compile-overlay";
  /** Installs the piece and returns its teardown. */
  readonly install: () => () => void;
}

/** The pieces {@link installDevClient} installs, in install order. */
export function devClientParts(
  options: DevClientOptions = {},
): DevClientPart[] {
  const parts: DevClientPart[] = [];
  // The island dialog + terminal forwarder carry React-DOM weight; the
  // `PLUMIX_DEV` gate dead-code-eliminates them (and this branch) from a build.
  if (process.env.PLUMIX_DEV) {
    parts.push(
      { name: "island-overlay", install: () => installIslandErrorOverlay() },
      {
        name: "terminal-forwarding",
        install: () =>
          installTerminalForwarding({
            level: parseForwardLevel(process.env.PLUMIX_FORWARD_ERRORS),
          }),
      },
    );
  }
  // The compile overlay needs the Vite HMR client; the caller gates the whole
  // dynamic import on `import.meta.hot`, so `hot` is only ever present in dev.
  const { hot, initialCompileError } = options;
  if (hot) {
    parts.push({
      name: "compile-overlay",
      install: () =>
        installCompileErrorOverlay(hot, { initialError: initialCompileError }),
    });
  }
  return parts;
}

/**
 * Each piece installs idempotently, so an HMR re-run never stacks listeners.
 */
export function installDevClient(options: DevClientOptions = {}): () => void {
  const teardowns = devClientParts(options).map((part) => part.install());
  return () => {
    for (const teardown of teardowns) teardown();
  };
}
