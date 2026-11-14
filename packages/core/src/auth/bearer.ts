/**
 * Must stay a superset of what `apiTokenAuthenticator` parses, so an
 * unparseable header fails closed to 401, not anonymous.
 */
const BEARER = /^bearer\s+\S/i;

export function hasBearerToken(request: Request): boolean {
  return BEARER.test(request.headers.get("authorization") ?? "");
}
