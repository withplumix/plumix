/**
 * Root-relative base of the dev request-history read routes. Kept in step with
 * the literal the dispatcher inlines — it keeps its eager graph free of every
 * debug-bar module (reaching the feature only via a dev-gated dynamic import),
 * so this constant is duplicated there rather than imported.
 */
export const DEBUG_REQUESTS_PATH = "/_plumix/debug/requests";

/**
 * Whether a (base-stripped) pathname targets the read routes — the collection
 * itself or a `/<id>` detail. The dispatcher uses this to route; the history
 * writer uses it to exclude its own endpoint from capture (no self-pollution).
 *
 * Deliberately a leaf module with no `react-dom` / render imports: the writer
 * needs only this predicate, so keeping it here means importing it never drags
 * the panel-rendering graph onto a path that must stay prod-lean.
 */
export function isDebugRequestsPath(pathname: string): boolean {
  return (
    pathname === DEBUG_REQUESTS_PATH ||
    pathname.startsWith(`${DEBUG_REQUESTS_PATH}/`)
  );
}
