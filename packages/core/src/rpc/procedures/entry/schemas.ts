import * as v from "valibot";

import { entryInsertSchema } from "../../../db/schema/entries.js";
import { idParam, metaInputSchema } from "../../contract/validation.js";
import { slugSchema } from "../../schemas.js";

export const MAX_CONTENT_BYTES = 1_000_000;
const MAX_EXCERPT_LENGTH = 600;
// 200 covers WordPress's practical ceiling many times over while still
// bounding pathological payloads on the record-validate path.
const MAX_TERMS_PER_TAXONOMY = 200;

const trimmedText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

// Entry titles may be empty — a draft can be untitled (read surfaces render
// a localized fallback). Unlike `trimmedText`, no `minLength`.
const titleText = v.pipe(v.string(), v.trim(), v.maxLength(300));

// The renderer allowlists node types, so this rejects only non-objects; the
// byte cap is enforced in the handler.
const contentSchema = v.nullable(v.record(v.string(), v.unknown()));
const excerptSchema = v.nullable(
  v.pipe(v.string(), v.maxLength(MAX_EXCERPT_LENGTH)),
);

// Not validated against the theme: an unknown id falls through to the
// default at render time. `null` clears the choice.
const templateChoiceSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
);

// Unlike the template choice, the server validates the key against the
// type's declared `access.policies`; this only bounds the shape. `null`
// restores type-default gating.
const accessChoiceSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
);

const serverControlledKeys = [
  "id",
  "authorId",
  "publishedAt",
  "createdAt",
  "updatedAt",
] as const;

const userSuppliableFields = v.omit(entryInsertSchema, serverControlledKeys);

// termTaxonomy → ordered term ids. Empty array clears all assignments for that
// termTaxonomy. Taxonomy keys not in the map are untouched.
const postTermsSchema = v.record(
  v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(100),
    v.regex(/^[a-zA-Z0-9_-]+$/, "termTaxonomy must be kebab/snake ASCII"),
  ),
  v.pipe(v.array(idParam), v.maxLength(MAX_TERMS_PER_TAXONOMY)),
);

export const entryCreateInputSchema = v.object({
  ...userSuppliableFields.entries,
  type: v.optional(trimmedText(100), "post"),
  // A fresh draft is untitled (stored as "") so the editor shows a placeholder
  // rather than a literal "Untitled" the author must delete.
  title: v.optional(titleText),
  slug: slugSchema,
  content: v.optional(contentSchema),
  excerpt: v.optional(excerptSchema),
  status: v.optional(userSuppliableFields.entries.status, "draft"),
  parentId: v.optional(v.nullable(idParam)),
  sortOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  terms: v.optional(postTermsSchema),
  meta: v.optional(metaInputSchema),
  /**
   * Target publish time; required (and must be future) when `status:
   * "scheduled"`.
   */
  publishedAt: v.optional(v.date()),
});

export const entryUpdateInputSchema = v.object({
  id: idParam,
  // Empty clears the title (untitled) — read surfaces render a fallback.
  title: v.optional(titleText),
  slug: v.optional(slugSchema),
  content: v.optional(contentSchema),
  excerpt: v.optional(excerptSchema),
  status: v.optional(userSuppliableFields.entries.status),
  parentId: v.optional(v.nullable(idParam)),
  sortOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  terms: v.optional(postTermsSchema),
  meta: v.optional(metaInputSchema),
  /** Named-template choice; `null` clears it. See `templateChoiceSchema`. */
  template: v.optional(v.nullable(templateChoiceSchema)),
  /**
   * Per-entry access-policy choice; `null` clears it. See `accessChoiceSchema`.
   */
  access: v.optional(v.nullable(accessChoiceSchema)),
  /**
   * Target publish time; required (and must be future) when `status:
   * "scheduled"`.
   */
  publishedAt: v.optional(v.date()),
  /**
   * The live `updatedAt` the caller loaded; a newer write rejects with CONFLICT
   * `stale_expected_updated_at`. Omitted means last write wins.
   */
  expectedLiveUpdatedAt: v.optional(v.date()),
  /**
   * `'draft'` needs a published entry on a `supports: ['autosave']` type, else
   * BAD_REQUEST `autosave_unsupported`. Omitted means `'live'`.
   */
  saveAs: v.optional(v.picklist(["draft", "live"] as const)),
});

// Bounds the generated `IN (?, ?, …)` subquery against pathological input.
const MAX_TERM_SLUGS_PER_TAXONOMY = 50;

const taxonomyNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(100),
  v.regex(/^[a-zA-Z0-9_-]+$/, "termTaxonomy must be kebab/snake ASCII"),
);

const termSlugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
);

// Wire names, not drizzle field names, so the API stays stable if the TS
// fields are renamed.
export const ENTRY_LIST_ORDER_COLUMNS = [
  "updated_at",
  "published_at",
  "title",
  "sort_order",
] as const;

export const entryListInputSchema = v.object({
  type: v.optional(trimmedText(100)),
  /** When omitted, `trash` is excluded; pass `["trash"]` to see it. */
  status: v.optional(
    v.union([
      userSuppliableFields.entries.status,
      v.pipe(v.array(userSuppliableFields.entries.status), v.minLength(1)),
    ]),
  ),
  /**
   * Filter by the entry's `authorId`. Admin "Mine" filter passes the
   * session user's id here; future UIs can surface an author dropdown.
   */
  authorId: v.optional(idParam),
  /** `null` returns only top-level entries; omitted applies no filter. */
  parentId: v.optional(v.nullable(idParam)),
  /**
   * Searches `title` and `excerpt`, not `content`, whose block envelope reads
   * as prose to a substring match. Terms AND together; `"phrases"` stay whole;
   * a leading `-` excludes.
   */
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  /**
   * OR within one taxonomy, AND across taxonomies, like WordPress's
   * `tax_query`. An empty slug array is a no-op.
   */
  termTaxonomies: v.optional(
    v.record(
      taxonomyNameSchema,
      v.pipe(v.array(termSlugSchema), v.maxLength(MAX_TERM_SLUGS_PER_TAXONOMY)),
    ),
  ),
  /** `id` is always added as a stable tiebreaker. */
  orderBy: v.optional(v.picklist(ENTRY_LIST_ORDER_COLUMNS), "updated_at"),
  order: v.optional(v.picklist(["asc", "desc"] as const), "desc"),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    20,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const entryGetInputSchema = v.object({
  id: idParam,
  /**
   * Overlays the caller's autosave and adds `_preview`. Needs `edit_own` or
   * `edit_any`, since previewing a pending draft is an editor concern.
   */
  preview: v.optional(v.boolean()),
});
export const entryTrashInputSchema = v.object({ id: idParam });
export const entryRestoreInputSchema = v.object({ id: idParam });
export const entryDeletePermanentInputSchema = v.object({ id: idParam });
export const entryDuplicateInputSchema = v.object({ id: idParam });
export const entryCreatePreviewLinkInputSchema = v.object({ id: idParam });

export const entryRefreshBlockLoaderInputSchema = v.object({
  id: idParam,
  blockId: v.pipe(v.string(), v.minLength(1)),
});

// Bulk action input. Capped at 100 ids per call so a single batched
// `WHERE id IN (…)` stays bounded; the admin selects a page at a time.
const bulkIdsSchema = v.object({
  ids: v.pipe(v.array(idParam), v.minLength(1), v.maxLength(100)),
});
export const entryTrashManyInputSchema = bulkIdsSchema;
export const entryRestoreManyInputSchema = bulkIdsSchema;
export const entryDeletePermanentManyInputSchema = bulkIdsSchema;

export const entryRecentActivityInputSchema = v.object({
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
    10,
  ),
});

export type EntryListInput = v.InferOutput<typeof entryListInputSchema>;
export type EntryGetInput = v.InferOutput<typeof entryGetInputSchema>;
export type EntryCreateInput = v.InferOutput<typeof entryCreateInputSchema>;
export type EntryUpdateInput = v.InferOutput<typeof entryUpdateInputSchema>;
export type EntryTrashInput = v.InferOutput<typeof entryTrashInputSchema>;
