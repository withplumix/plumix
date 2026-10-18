/** How long a lease lasts after its last renewal. */
export const EDIT_LEASE_DURATION_MS = 120_000;

/**
 * How often an open editor renews its edit lease: well inside the 120 seconds
 * a lease lasts, so a missed renewal or two never lets it lapse.
 */
export const EDIT_LEASE_RENEW_INTERVAL_MS = 30_000;
