import * as v from "valibot";

import type { EntryStatus } from "@plumix/core/manifest";
import {
  ENTRY_LIST_ORDER_COLUMNS,
  ENTRY_STATUSES,
} from "@plumix/core/manifest";

const LEADING_STATUS: EntryStatus = "published";

export const STATUS_FILTER_VALUES = [
  "all",
  LEADING_STATUS,
  ...ENTRY_STATUSES.filter((status) => status !== LEADING_STATUS),
] as const;
export type StatusFilter = "all" | EntryStatus;

export type OrderBy = (typeof ENTRY_LIST_ORDER_COLUMNS)[number];

const ORDER_VALUES = ["asc", "desc"] as const;
export type Order = (typeof ORDER_VALUES)[number];

const AUTHOR_VALUES = ["all", "mine"] as const;
export type AuthorFilter = (typeof AUTHOR_VALUES)[number];

/**
 * `looseObject` keeps unknown keys verbatim so per-taxonomy filters
 * land on the URL as `?category=foo&tag=bar` without requiring the
 * schema to enumerate every taxonomy a plugin might register.
 */
export const entriesListSearchSchema = v.looseObject({
  page: v.optional(
    v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  status: v.optional(
    v.fallback(v.picklist(STATUS_FILTER_VALUES), "all"),
    "all",
  ),
  // Free-text search. Empty string coerces to `undefined` so the URL stays
  // clean (`?q=` doesn't linger after the user clears the input).
  q: v.optional(
    v.fallback(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(200),
        v.transform((value) => (value.length === 0 ? undefined : value)),
      ),
      undefined,
    ),
  ),
  author: v.optional(v.fallback(v.picklist(AUTHOR_VALUES), "all"), "all"),
  orderBy: v.optional(
    v.fallback(v.picklist(ENTRY_LIST_ORDER_COLUMNS), "updated_at"),
    "updated_at",
  ),
  order: v.optional(v.fallback(v.picklist(ORDER_VALUES), "desc"), "desc"),
});
