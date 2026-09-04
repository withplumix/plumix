/**
 * The reserved segment that is never shared-cached. A `grant("private")` gates
 * the route yet keeps its render per-visitor — the explicit escape hatch for a
 * personalized authenticated page. The edge cache never reads or writes it.
 */
export const PRIVATE_SEGMENT = "private";
