// Optimistic-concurrency guard for live-row writes. Compares the caller's
// loaded `updatedAt` token against the server's current `updatedAt`; on
// disagreement another write landed first and the caller should resolve.
// Point-in-time check, not transactional — concurrent writes between this
// call and the eventual UPDATE can still slip through; tighten via a
// `WHERE id = ? AND updatedAt = ?` clause if that window matters.
export function assertExpectedLiveUpdatedAt(
  expected: Date | undefined,
  current: Date,
  guards: { readonly stale: () => never },
): void {
  if (expected === undefined) return;
  if (expected.getTime() !== current.getTime()) guards.stale();
}
