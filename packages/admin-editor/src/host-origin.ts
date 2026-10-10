/**
 * Cross-origin dev passes the host origin via `plumix.host`; same-origin
 * deployments use the page's own.
 */
export function resolveHostOrigin(
  search: string,
  currentOrigin: string,
): string {
  const param = new URLSearchParams(search).get("plumix.host");
  if (!param) return currentOrigin;
  try {
    // Normalize to a bare origin; a malformed value would otherwise throw in
    // postMessage and silently break the bridge.
    return new URL(param).origin;
  } catch {
    return currentOrigin;
  }
}
