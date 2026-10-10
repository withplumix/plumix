/**
 * Point-in-time, not transactional: a write between this check and the
 * UPDATE can still slip through.
 */
export function assertExpectedLiveUpdatedAt(
  expected: Date | undefined,
  current: Date,
  guards: { readonly stale: () => never },
): void {
  if (expected === undefined) return;
  if (expected.getTime() !== current.getTime()) guards.stale();
}
