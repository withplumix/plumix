/**
 * Browser-safe entry point that installs plumix's dev-only client error
 * surfaces from ONE place — the plumix client bootstrap — inverting the old
 * arrangement where `@plumix/blocks`'s island runtime installed the overlays
 * itself.
 *
 * `@plumix/blocks` now only hydrates islands and dispatches `plumix:island-*`
 * events; this module is the single listener/installer. It imports ONLY the
 * browser-safe `core/dev/ui` implementations — never core server internals — so
 * the `@plumix/core/dev-client` subpath carries no `node:async_hooks` into the
 * client bundle. The island event contract it reads still lives in
 * `@plumix/blocks` (`@plumix/blocks/island-events`), consumed core → blocks.
 *
 * Everything is gated so it tree-shakes out of production: the caller wraps the
 * dynamic import in `import.meta.hot` (undefined in a build), and the island
 * dialog + terminal forwarder additionally check `process.env.PLUMIX_DEV`
 * (Vite-substituted to an empty string in a build).
 */

import type { HmrClient, InstallOptions } from "../dev/ui/index.js";
import {
  installCompileErrorOverlay,
  installIslandErrorOverlay,
  installTerminalForwarding,
  parseForwardLevel,
} from "../dev/ui/index.js";

export type { HmrClient, ViteErrorPayload } from "../dev/ui/index.js";

// Re-exported for the plumix Vite plugin — the dev-server side of these
// endpoints, the one external consumer that used to reach them through
// `@plumix/blocks/dev-error`. They are the browser↔dev-server contract: the
// client posts to these endpoints carrying these payload shapes.
export {
  DEV_ERROR_CLIENT_ERRORS_ENDPOINT,
  DEV_ERROR_SOURCE_ENDPOINT,
  DEV_ERROR_STACK_ENDPOINT,
  DEV_ERROR_TERMINAL_ENDPOINT,
} from "../dev/ui/index.js";
export type { DevErrorFrame, ForwardedLog } from "../dev/ui/index.js";

export interface DevClientOptions {
  /**
   * The Vite HMR client (`import.meta.hot`). When present, the compile/import
   * error overlay is installed and subscribes to `vite:error`; when omitted, the
   * compile overlay is skipped (there is no HMR channel to observe).
   */
  readonly hot?: HmrClient;
  /**
   * A `vite:error` payload the caller buffered before this module finished
   * loading — the page was served onto an already-broken module, so the event
   * raced this (lazily-imported) install. Replayed into the compile overlay so
   * the error isn't lost now that Vite's own overlay is disabled.
   */
  readonly initialCompileError?: InstallOptions["initialError"];
}

/**
 * Install the dev-only client error tools: the island error dialog, the
 * browser-errors-to-terminal forwarder, and — when a Vite HMR client is
 * supplied — the compile/import error overlay. Returns a teardown that
 * uninstalls every piece it installed (idempotent installs return their
 * existing teardown, so an HMR re-run of the bootstrap never stacks listeners).
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
