/**
 * The dispatcher inlines a copy of this literal to keep this cluster out of its
 * eager graph; keep the two in step.
 */
export const DEBUG_REQUESTS_PATH = "/_plumix/debug/requests";

/**
 * Expects a base-stripped pathname. Keep this module free of render imports:
 * the writer reaches it on a path that has to stay prod-lean.
 */
export function isDebugRequestsPath(pathname: string): boolean {
  return (
    pathname === DEBUG_REQUESTS_PATH ||
    pathname.startsWith(`${DEBUG_REQUESTS_PATH}/`)
  );
}
