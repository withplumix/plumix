// Optimistic-concurrency guard for live-row writes. Compares the
// caller's loaded `updatedAt` token against the server's current
// `updatedAt`; if they disagree, another write landed in between and
// the caller should resolve before clobbering.
//
// Pure value comparison — no oRPC, no DB. Callers wire the staleness
// signal to whatever surface they expose (typed RPC CONFLICT here;
// future callers may surface as something else). Matches the
// guards-as-callbacks style used elsewhere in `update.ts`.
export function assertExpectedLiveUpdatedAt(
  expected: Date | undefined,
  current: Date,
  guards: { readonly stale: () => never },
): void {
  if (expected === undefined) return;
  if (expected.getTime() !== current.getTime()) guards.stale();
}
