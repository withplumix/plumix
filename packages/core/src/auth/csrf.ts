/**
 * Two-layered CSRF protection per docs/reference/architecture/09-packages/03-core/02-auth.md §"CSRF protection":
 *
 * 1. RPC + auth endpoints: require a custom `X-Plumix-Request: 1` header.
 *    Browsers cannot set custom headers on cross-origin requests without a
 *    CORS preflight, and Plumix does not enable CORS — so a forged request
 *    from another origin cannot include this header.
 *
 * 2. Public route mutations (POST/PUT/PATCH/DELETE): validate the Origin
 *    header (or Referer if Origin is absent) against the site origin. This
 *    is stateless and CDN-cache compatible.
 *
 * Combined with `SameSite=Lax` on the session cookie this covers all modern
 * browsers; Origin/Referer check covers older clients without SameSite support.
 */

export const CSRF_HEADER_NAME = "X-Plumix-Request";
export const CSRF_HEADER_VALUE = "1";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * True when the request includes the expected `X-Plumix-Request` header.
 * Use on RPC and auth endpoints. Returns true for safe (non-mutating)
 * methods so GETs aren't blocked.
 */
export function hasCsrfHeader(request: Request): boolean {
  if (isSafeMethod(request.method)) return true;
  return request.headers.get(CSRF_HEADER_NAME) === CSRF_HEADER_VALUE;
}

export interface OriginCheckOptions {
  /** Allowed origins (e.g. `https://cms.example.com`). Compared exactly. */
  readonly allowed: readonly string[];
}

/**
 * Validate Origin (or Referer) for non-safe methods. Returns false on
 * mismatch / missing header. Safe methods always pass.
 */
export function hasMatchingOrigin(
  request: Request,
  options: OriginCheckOptions,
): boolean {
  if (isSafeMethod(request.method)) return true;
  const origin = request.headers.get("origin");
  if (origin) return options.allowed.includes(origin);

  // Some legacy clients omit Origin on same-origin POSTs — fall back to Referer.
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const refOrigin = new URL(referer).origin;
    return options.allowed.includes(refOrigin);
  } catch {
    return false;
  }
}

export class CsrfError extends Error {
  static {
    CsrfError.prototype.name = "CsrfError";
  }

  readonly code: "missing_header" | "origin_mismatch";

  private constructor(
    code: "missing_header" | "origin_mismatch",
    message: string,
  ) {
    super(message);
    this.code = code;
  }

  static missingHeader(): CsrfError {
    return new CsrfError(
      "missing_header",
      `Missing required header ${CSRF_HEADER_NAME}: ${CSRF_HEADER_VALUE}`,
    );
  }

  static originMismatch(): CsrfError {
    return new CsrfError(
      "origin_mismatch",
      "Origin / Referer does not match site",
    );
  }
}

export function requireCsrf(request: Request): void {
  if (!hasCsrfHeader(request)) {
    throw CsrfError.missingHeader();
  }
}

export function requireMatchingOrigin(
  request: Request,
  options: OriginCheckOptions,
): void {
  if (!hasMatchingOrigin(request, options)) {
    throw CsrfError.originMismatch();
  }
}
