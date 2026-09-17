/**
 * Root-relative base of the dev request-history read routes. Kept in step with
 * the literal the dispatcher inlines — it keeps its eager graph free of every
 * module in this cluster (reaching the feature only via a dev-gated dynamic
 * import), so this constant is duplicated there rather than imported.
 */
export const DEBUG_REQUESTS_PATH = "/_plumix/debug/requests";

/**
 * Whether a (base-stripped) pathname targets the read routes — the collection
 * itself or a `/<id>` detail. The history writer uses it to exclude its own
 * endpoint from capture (no self-pollution); the dispatcher matches its own
 * inlined prefix instead, for the reason above.
 *
 * Deliberately a leaf module with no `react-dom` / render imports, and it sits
 * in the capture layer rather than beside the routes it names: the writer needs
 * only this predicate, and reaching for it must never drag the panel-rendering
 * graph onto a path that has to stay prod-lean.
 */
export function isDebugRequestsPath(pathname: string): boolean {
  return (
    pathname === DEBUG_REQUESTS_PATH ||
    pathname.startsWith(`${DEBUG_REQUESTS_PATH}/`)
  );
}
