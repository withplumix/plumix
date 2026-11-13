import type { EntryRow } from "@/editor/entry-autosave.js";

type EntryStatus = Pick<EntryRow, "status">;

/**
 * The entry read lags a publish until its refetch lands, and an autosave type
 * swaps the plain Publish button out once it does.
 */
export function isPublished(
  entry: EntryStatus,
  landedPublish: EntryStatus | null,
): boolean {
  return entry.status === "published" || landedPublish?.status === "published";
}
