import { ORPCError } from "@orpc/client";
import * as v from "valibot";

/**
 * Batches typing bursts; the dedup snapshot, not this delay, prevents identical
 * revisions.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/** Another write landed since this editor's copy: where the entry is now. */
export interface EntryConflict {
  readonly etag: string;
  readonly updatedAt: Date;
}

/**
 * `conflict` is a stale copy, never retried on the author's behalf: they
 * choose. `failed` didn't persist, and the author must be told.
 */
export type AutosaveErrorOutcome =
  | { readonly kind: "conflict"; readonly conflict: EntryConflict }
  | { readonly kind: "failed" };

const staleCopy = v.object({
  reason: v.literal("etag_mismatch"),
  etag: v.string(),
  updatedAt: v.date(),
});

export function classifyAutosaveError(err: unknown): AutosaveErrorOutcome {
  if (!(err instanceof ORPCError) || err.code !== "CONFLICT") {
    return { kind: "failed" };
  }
  const parsed = v.safeParse(staleCopy, err.data);
  if (!parsed.success) return { kind: "failed" };
  const { etag, updatedAt } = parsed.output;
  return { kind: "conflict", conflict: { etag, updatedAt } };
}
