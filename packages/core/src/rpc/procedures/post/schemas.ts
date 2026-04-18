import * as v from "valibot";

import { postInsertSchema } from "../../../db/schema/posts.js";
import { slugSchema } from "../../schemas.js";

const MAX_CONTENT_BYTES = 1_000_000;
const MAX_EXCERPT_LENGTH = 600;

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
// taxonomy. Taxonomy keys not in the map are untouched. Capped to prevent
// pathological payloads; 200 covers WP's practical ceiling many times over.
const termIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const postTermsSchema = v.record(
  v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(100),
    v.regex(/^[a-zA-Z0-9_-]+$/, "taxonomy must be kebab/snake ASCII"),
  ),
  v.pipe(v.array(termIdSchema), v.maxLength(200)),
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

export const postListInputSchema = v.object({
  type: v.optional(trimmedText(100)),
  status: v.optional(userSuppliableFields.entries.status),
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
