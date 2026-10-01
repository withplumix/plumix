export interface SessionPolicy {
  /** Sliding-window duration. The cookie's Max-Age and DB expiresAt. */
  readonly maxAgeSeconds: number;
  /** Hard ceiling regardless of activity — re-auth required past this. */
  readonly absoluteMaxAgeSeconds: number;
  /** Refresh expiry only when more than this fraction of life has elapsed. */
  readonly refreshThreshold: number;
}
