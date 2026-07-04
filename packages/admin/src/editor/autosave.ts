import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc.js";
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

/**
 * On a stale-token conflict, refetch the live row and return its `updatedAt`
 * so the caller can re-anchor the optimistic-concurrency token; null when the
 * refetch fails (best-effort — the next edit retries).
 */
async function freshLiveUpdatedAt(
  err: unknown,
  queryClient: QueryClient,
  id: number,
): Promise<Date | null> {
  if (!isStaleConflictError(err)) return null;
  try {
    const fresh = await queryClient.fetchQuery({
      ...orpc.entry.get.queryOptions({ input: { id } }),
      staleTime: 0,
    });
    return fresh.updatedAt;
  } catch {
    return null;
  }
}

/**
 * Classify an autosave write error:
 * - `recovered`: a stale-token conflict — re-anchor on `updatedAt` when the
 *   refetch succeeded (`null` = refetch failed; the next edit retries). Either
 *   way the edit is intact, so stay quiet.
 * - `failed`: the write genuinely didn't persist (invalid block content,
 *   over-cap, server/network error). The author MUST be told, not silently
 *   dropped.
 */
export type AutosaveErrorOutcome =
  | { readonly kind: "recovered"; readonly updatedAt: Date | null }
  | { readonly kind: "failed" };

export async function classifyAutosaveError(
  err: unknown,
  queryClient: QueryClient,
  id: number,
): Promise<AutosaveErrorOutcome> {
  if (!isStaleConflictError(err)) return { kind: "failed" };
  return {
    kind: "recovered",
    updatedAt: await freshLiveUpdatedAt(err, queryClient, id),
  };
}
