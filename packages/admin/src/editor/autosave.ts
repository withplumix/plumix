import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc.js";
import { ORPCError } from "@orpc/client";

/**
 * Batches typing bursts; the dedup snapshot, not this delay, prevents identical
 * revisions.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * A stale optimistic-concurrency token: the live row moved since we read it.
 * Both editor routes recover by refetching the row and retrying.
 */
export function isStaleConflictError(err: unknown): boolean {
  if (!(err instanceof ORPCError)) return false;
  if (err.code !== "CONFLICT") return false;
  const data = err.data as { reason?: unknown };
  return data.reason === "stale_expected_updated_at";
}

/** Best-effort: null when the refetch fails, and the next edit retries. */
async function freshLiveUpdatedAt(
  err: unknown,
  queryClient: QueryClient,
  id: number,
): Promise<Date | null> {
  if (!isStaleConflictError(err)) return null;
  try {
    const fresh = await queryClient.query({
      ...orpc.entry.get.queryOptions({ input: { id } }),
      staleTime: 0,
    });
    return fresh.updatedAt;
  } catch {
    return null;
  }
}

/**
 * `recovered` is a stale-token conflict with the edit intact, so stay quiet.
 * `failed` didn't persist, and the author must be told.
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
