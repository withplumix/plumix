import type { LeaseHolder, LeaseRefusal } from "@/editor/edit-lease.js";
import { lockedBy } from "@/editor/edit-lease.js";
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
  readonly holder?: LeaseHolder;
}

/**
 * `conflict` is a stale copy, never retried on the author's behalf: they
 * choose. `locked` is another user's edit lease. `failed` didn't persist, and
 * the author must be told.
 */
export type AutosaveErrorOutcome =
  | { readonly kind: "conflict"; readonly conflict: EntryConflict }
  | { readonly kind: "locked"; readonly locked: LeaseRefusal }
  | { readonly kind: "failed" };

const staleCopy = v.object({
  reason: v.literal("etag_mismatch"),
  etag: v.string(),
  updatedAt: v.date(),
  holder: v.optional(v.object({ id: v.number(), name: v.string() })),
});

export function classifyAutosaveError(err: unknown): AutosaveErrorOutcome {
  const locked = lockedBy(err);
  if (locked) return { kind: "locked", locked };
  if (!(err instanceof ORPCError) || err.code !== "CONFLICT") {
    return { kind: "failed" };
  }
  const parsed = v.safeParse(staleCopy, err.data);
  if (!parsed.success) return { kind: "failed" };
  const { etag, updatedAt, holder } = parsed.output;
  return {
    kind: "conflict",
    conflict: holder ? { etag, updatedAt, holder } : { etag, updatedAt },
  };
}
