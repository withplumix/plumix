import * as v from "valibot";

import { entryInsertSchema } from "../../../db/schema/entries.js";
import { slugSchema } from "../../schemas.js";
import { idParam } from "../../validation.js";

export const MAX_CONTENT_BYTES = 1_000_000;
const MAX_EXCERPT_LENGTH = 600;
// 200 covers WordPress's practical ceiling many times over while still
// bounding pathological payloads on the record-validate path.
const MAX_TERMS_PER_TAXONOMY = 200;

const trimmedText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

// Content is a ProseMirror JSON document. The public renderer's walker
// allowlists node types on render, so the RPC only rejects obvious
// garbage (non-objects). Byte-size cap is enforced in the handler via
// `assertContentWithinByteCap` after a single serialize.
const contentSchema = v.nullable(v.record(v.string(), v.unknown()));
const excerptSchema = v.nullable(
  v.pipe(v.string(), v.maxLength(MAX_EXCERPT_LENGTH)),
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

// Meta bag accepted by `post.create` / `post.update`. Per-key validation
// happens in the handler against the plugin-registered `MetaScalarType`
// — here we only enforce the outer shape + a defensive cap on the
// number of keys per request so a malformed client can't ship a 10k-key
// object at us. Values stay `unknown` because the registry drives their
// shape.
const MAX_META_KEYS_PER_REQUEST = 200;

const metaKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-zA-Z0-9_:-]+$/, "meta key must be alphanumeric/_/:/-"),
);

const entryMetaInputSchema = v.pipe(
  v.record(metaKeySchema, v.unknown()),
  v.check(
    (val) => Object.keys(val).length <= MAX_META_KEYS_PER_REQUEST,
    `meta accepts at most ${MAX_META_KEYS_PER_REQUEST} keys per request`,
  ),
);

export const entryCreateInputSchema = v.object({
  ...userSuppliableFields.entries,
  type: v.optional(trimmedText(100), "post"),
  title: trimmedText(300),
  slug: slugSchema,
  content: v.optional(contentSchema),
  excerpt: v.optional(excerptSchema),
  status: v.optional(userSuppliableFields.entries.status, "draft"),
  menuOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  terms: v.optional(postTermsSchema),
  meta: v.optional(entryMetaInputSchema),
});

export const entryUpdateInputSchema = v.object({
  id: idParam,
  title: v.optional(trimmedText(300)),
  slug: v.optional(slugSchema),
  content: v.optional(contentSchema),
  excerpt: v.optional(excerptSchema),
  status: v.optional(userSuppliableFields.entries.status),
  parentId: v.optional(v.nullable(idParam)),
  menuOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  terms: v.optional(postTermsSchema),
  meta: v.optional(entryMetaInputSchema),
});

// Upper bound on the term-slug list per termTaxonomy clause. Mirrors the
// per-termTaxonomy guard on `post.update` — admin UIs don't reasonably issue
// queries beyond this, and the cap protects the generated `IN (?, ?, …)`
// subquery from pathological input lengths.
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

// Whitelist of columns the caller is allowed to sort by. Keys are the
// wire-level names (snake_case, matching DB columns) so the API surface
// stays stable even if we rename the drizzle TS fields later. The handler
// maps these to column references.
export const ENTRY_LIST_ORDER_COLUMNS = [
  "updated_at",
  "published_at",
  "title",
  "menu_order",
] as const;
export type EntryListOrderColumn = (typeof ENTRY_LIST_ORDER_COLUMNS)[number];

export const entryListInputSchema = v.object({
  type: v.optional(trimmedText(100)),
  /**
   * Status filter. Accepts a single status or a list — WP admin views
   * like "Drafts + Pending" need arrays. When omitted, the handler
   * excludes `trash` by default (WP's "All" semantics — trash is its
   * own view, not part of the flat list). Pass `["trash"]` explicitly
   * to see trashed entries.
   */
  status: v.optional(
    v.union([
      userSuppliableFields.entries.status,
      v.pipe(v.array(userSuppliableFields.entries.status), v.minLength(1)),
    ]),
  ),
  /**
   * Filter by the post's `authorId`. Admin "Mine" filter passes the
   * session user's id here; future UIs can surface an author dropdown.
   */
  authorId: v.optional(idParam),
  /**
   * Filter by parent post id for hierarchical types (pages, etc.).
   * - `null` → only top-level entries (parent_id IS NULL).
   * - a number → only direct children of that post.
   * - omitted → no filter, flat list across all depths.
   */
  parentId: v.optional(v.nullable(idParam)),
  /**
   * Free-text search across `title`, `content`, and `excerpt`. Whitespace
   * separates terms (all AND-ed), `"quoted phrases"` stay whole, and a
   * leading `-` on a bare term excludes matches (WordPress semantics).
   * Capped at 200 chars to bound the LIKE workload per row.
   */
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  /**
   * Taxonomy clauses, keyed by termTaxonomy name. Each value is a list of term
   * slugs the post must be associated with in that termTaxonomy. Within one
   * termTaxonomy the match is OR (any listed slug); across termTaxonomies the
   * match is AND (every specified termTaxonomy must contribute a match).
   * Matches the default semantics of WordPress's `tax_query`.
   *
   * Empty slug arrays are no-ops for that termTaxonomy.
   */
  termTaxonomies: v.optional(
    v.record(
      taxonomyNameSchema,
      v.pipe(v.array(termSlugSchema), v.maxLength(MAX_TERM_SLUGS_PER_TAXONOMY)),
    ),
  ),
  /**
   * Column to sort by. Whitelisted — arbitrary values are rejected so a
   * malicious caller can't probe the schema. `id` is always applied as a
   * stable tiebreaker by the handler, not exposed here.
   */
  orderBy: v.optional(v.picklist(ENTRY_LIST_ORDER_COLUMNS), "updated_at"),
  order: v.optional(v.picklist(["asc", "desc"] as const), "desc"),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    20,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const entryGetInputSchema = v.object({ id: idParam });
export const entryTrashInputSchema = v.object({ id: idParam });

export type EntryListInput = v.InferOutput<typeof entryListInputSchema>;
export type EntryGetInput = v.InferOutput<typeof entryGetInputSchema>;
export type EntryCreateInput = v.InferOutput<typeof entryCreateInputSchema>;
export type EntryUpdateInput = v.InferOutput<typeof entryUpdateInputSchema>;
export type EntryTrashInput = v.InferOutput<typeof entryTrashInputSchema>;
