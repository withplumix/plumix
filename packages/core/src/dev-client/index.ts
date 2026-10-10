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

/**
 * Each piece installs idempotently, so an HMR re-run never stacks listeners.
 */
export function installDevClient(options: DevClientOptions = {}): () => void {
  const teardowns: (() => void)[] = [];
  // The island dialog + terminal forwarder carry React-DOM weight; the
  // `PLUMIX_DEV` gate dead-code-eliminates them (and this branch) from a build.
  if (process.env.PLUMIX_DEV) {
    teardowns.push(installIslandErrorOverlay());
    teardowns.push(
      installTerminalForwarding({
        level: parseForwardLevel(process.env.PLUMIX_FORWARD_ERRORS),
      }),
    );
  }
  // The compile overlay needs the Vite HMR client; the caller gates the whole
  // dynamic import on `import.meta.hot`, so `hot` is only ever present in dev.
  if (options.hot) {
    teardowns.push(
      installCompileErrorOverlay(options.hot, {
        initialError: options.initialCompileError,
      }),
    );
  }
  return () => {
    for (const teardown of teardowns) teardown();
  };
}
