/**
 * Public `plumix/blocks/dev-error` surface.
 *
 * The dev-only client compile/import error overlay (#1622). The generated
 * client entry (`.plumix/client-entry.ts`) lazy-imports this behind the
 * `import.meta.hot` dev gate to install `installCompileErrorOverlay`, so a
 * consumer app reaches it through the `plumix` package rather than depending on
 * the workspace-internal `@plumix/blocks`. Nothing here runs on import, so the
 * whole module tree-shakes out of the production client bundle with the gate.
 */

export {
  compileErrorToInfo,
  installCompileErrorOverlay,
} from "@plumix/blocks/dev-error";
export type {
  HmrClient,
  InstallOptions,
  ViteErrorPayload,
} from "@plumix/blocks/dev-error";
