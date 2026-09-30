import type { Pagination, ResolvedEntry } from "./resolved-entry.js";

/** One page of an archive's entries, resolved the way a theme reads them. */
export interface EntryListing {
  readonly entries: readonly ResolvedEntry[];
  readonly pagination: Pagination;
}
