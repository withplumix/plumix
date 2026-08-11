/**
 * Runtime-neutral origin acceptance for the WebAuthn ceremony.
 *
 * A passkey is bound to an `rpId`; the browser reports the page `origin` in
 * clientDataJSON. Verification checks that origin against a declared policy —
 * the canonical `origin` plus any operator-declared `allowedOrigins`. `rpId`
 * is never derived from the request, so a policy can only *accept* origins the
 * operator listed, never widen the set from an attacker-chosen Host.
 *
 * An `allowedOrigins` entry is either an exact origin (`https://www.example.com`)
 * or a subdomain wildcard (`https://*.acme.workers.dev`) — the only shape that
 * can span the unbounded per-branch preview hosts Cloudflare (or any platform)
 * generates. Wildcards match strictly: https only, a real subdomain label, on
 * the default port, dot-boundary anchored.
 */
export interface OriginPolicy {
  /** Canonical origin the deploy is primarily served on. */
  readonly origin: string;
  /** Extra origins accepted at verification — exact or `https://*.base`. */
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
