export interface OriginPolicy {
  readonly origin: string;
  /**
   * Exact origins or `https://*.base` wildcards, which match https only, a real
   * subdomain label, default port.
   */
  readonly allowedOrigins?: readonly string[];
}

export const HTTPS_WILDCARD_PREFIX = "https://*.";

export function originAllowed(
  candidate: string,
  policy: OriginPolicy,
): boolean {
  if (candidate === policy.origin) return true;
  const allowed = policy.allowedOrigins;
  if (!allowed) return false;
  for (const entry of allowed) {
    if (entry.startsWith(HTTPS_WILDCARD_PREFIX)) {
      if (
        wildcardMatches(candidate, entry.slice(HTTPS_WILDCARD_PREFIX.length))
      ) {
        return true;
      }
    } else if (candidate === entry) {
      return true;
    }
  }
  return false;
}

function wildcardMatches(candidate: string, base: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port !== "") return false;
  const host = url.hostname;
  // A real subdomain label must precede the base — `.base` anchors the match
  // at a dot boundary so `evilbase` can't pass for `base`.
  return host.length > base.length + 1 && host.endsWith(`.${base}`);
}
