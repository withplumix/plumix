/**
 * One deadline for a self-hosted runtime's shutdown: in-flight responses
 * first, deferred work in what remains. Past it the process exits with what is
 * still running cut, so a stuck request or an open event stream cannot hold a
 * container through a rolling deploy.
 */
export const DRAIN_DEADLINE_MS = 10_000;
