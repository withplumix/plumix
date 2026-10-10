/**
 * Covers in-flight responses, then deferred work; past it the rest is cut so
 * nothing holds a container through a deploy.
 */
export const DRAIN_DEADLINE_MS = 10_000;
