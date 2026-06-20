import { ORPCError } from "@orpc/client";

// 1 s batches typing bursts; the dedup snapshot in each autosave closure is
// what actually prevents identical revisions. WordPress's 60 s equivalent is
// overkill here because we round-trip a workers DB on every save and revisions
// are cheap.
export const AUTOSAVE_DEBOUNCE_MS = 1000;

// A stale optimistic-concurrency token: the live row moved since we read it.
// Both editor routes recover by refetching the row and retrying.
export function isStaleConflictError(err: unknown): boolean {
  if (!(err instanceof ORPCError)) return false;
  if (err.code !== "CONFLICT") return false;
  const data = err.data as { reason?: unknown };
  return data.reason === "stale_expected_updated_at";
}
