/**
 * How often an open editor renews its edit lease: well inside
 * `EDIT_LEASE_DURATION_MS`, so a missed renewal or two never lets it lapse.
 */
export const EDIT_LEASE_RENEW_INTERVAL_MS = 30_000;
