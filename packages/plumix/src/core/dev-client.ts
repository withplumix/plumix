/**
 * Public `plumix/core/dev-client` surface.
 *
 * The single, core-owned install point for plumix's dev-only client error
 * tools — the island error dialog, the browser-errors-to-terminal forwarder,
 * and the compile/import error overlay (#1676). The generated client entry
 * (`.plumix/client-entry.ts`) lazy-imports this behind the `import.meta.hot`
 * dev gate and calls `installDevClient`, so a consumer app reaches it through
 * the `plumix` package rather than depending on the workspace-internal
 * `@plumix/core`. Nothing here runs on import, so the whole module tree-shakes
 * out of the production client bundle with the gate.
 */

export { installDevClient } from "@plumix/core/dev-client";
export type {
  DevClientOptions,
  HmrClient,
  ViteErrorPayload,
} from "@plumix/core/dev-client";
