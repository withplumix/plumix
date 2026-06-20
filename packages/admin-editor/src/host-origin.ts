// The editor iframe must know the host (admin shell) origin to pin bridge
// messages. Same-origin deployments fall back to the page's own origin;
// cross-origin dev passes it explicitly via the `plumix.host` query param.
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
