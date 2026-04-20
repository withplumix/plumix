import * as v from "valibot";

import { postInsertSchema } from "../../../db/schema/posts.js";
import { slugSchema } from "../../schemas.js";

const MAX_CONTENT_BYTES = 1_000_000;
const MAX_EXCERPT_LENGTH = 600;
// 200 covers WordPress's practical ceiling many times over while still
// bounding pathological payloads on the record-validate path.
const MAX_TERMS_PER_TAXONOMY = 200;

const trimmedText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

const postIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

const contentSchema = v.nullable(
  v.pipe(v.string(), v.maxLength(MAX_CONTENT_BYTES)),
);
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

const userSuppliableFields = v.omit(postInsertSchema, serverControlledKeys);

// taxonomy → ordered term ids. Empty array clears all assignments for that
// taxonomy. Taxonomy keys not in the map are untouched.
const termIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const postTermsSchema = v.record(
  v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(100),
    v.regex(/^[a-zA-Z0-9_-]+$/, "taxonomy must be kebab/snake ASCII"),
  ),
  v.pipe(v.array(termIdSchema), v.maxLength(MAX_TERMS_PER_TAXONOMY)),
);

export const postCreateInputSchema = v.object({
  ...userSuppliableFields.entries,
  type: v.optional(trimmedText(100), "post"),
  title: trimmedText(300),
  slug: slugSchema,
  content: v.optional(contentSchema),
  excerpt: v.optional(excerptSchema),
  status: v.optional(userSuppliableFields.entries.status, "draft"),
  menuOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const postUpdateInputSchema = v.object({
  id: postIdSchema,
  title: v.optional(trimmedText(300)),
  slug: v.optional(slugSchema),
  content: v.optional(contentSchema),
  excerpt: v.optional(excerptSchema),
  status: v.optional(userSuppliableFields.entries.status),
  parentId: v.optional(v.nullable(postIdSchema)),
  menuOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  terms: v.optional(postTermsSchema),
});

// Upper bound on the term-slug list per taxonomy clause. Mirrors the
// per-taxonomy guard on `post.update` — admin UIs don't reasonably issue
// queries beyond this, and the cap protects the generated `IN (?, ?, …)`
// subquery from pathological input lengths.
const MAX_TERM_SLUGS_PER_TAXONOMY = 50;

const taxonomyNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(100),
  v.regex(/^[a-zA-Z0-9_-]+$/, "taxonomy must be kebab/snake ASCII"),
);

const termSlugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
);

export const postListInputSchema = v.object({
  type: v.optional(trimmedText(100)),
  status: v.optional(userSuppliableFields.entries.status),
  /**
   * Filter by parent post id for hierarchical types (pages, etc.).
   * - `null` → only top-level posts (parent_id IS NULL).
   * - a number → only direct children of that post.
   * - omitted → no filter, flat list across all depths.
   */
  parentId: v.optional(v.nullable(postIdSchema)),
  /**
   * Free-text search across `title`, `content`, and `excerpt`. Whitespace
   * separates terms (all AND-ed), `"quoted phrases"` stay whole, and a
   * leading `-` on a bare term excludes matches (WordPress semantics).
   * Capped at 200 chars to bound the LIKE workload per row.
   */
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  /**
   * Taxonomy clauses, keyed by taxonomy name. Each value is a list of term
   * slugs the post must be associated with in that taxonomy. Within one
   * taxonomy the match is OR (any listed slug); across taxonomies the
   * match is AND (every specified taxonomy must contribute a match).
   * Matches the default semantics of WordPress's `tax_query`.
   *
   * Empty slug arrays are no-ops for that taxonomy.
   */
  taxonomies: v.optional(
    v.record(
      taxonomyNameSchema,
      v.pipe(v.array(termSlugSchema), v.maxLength(MAX_TERM_SLUGS_PER_TAXONOMY)),
    ),
  ),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    20,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const postGetInputSchema = v.object({ id: postIdSchema });
export const postTrashInputSchema = v.object({ id: postIdSchema });

export type PostListInput = v.InferOutput<typeof postListInputSchema>;
export type PostGetInput = v.InferOutput<typeof postGetInputSchema>;
export type PostCreateInput = v.InferOutput<typeof postCreateInputSchema>;
export type PostUpdateInput = v.InferOutput<typeof postUpdateInputSchema>;
export type PostTrashInput = v.InferOutput<typeof postTrashInputSchema>;
