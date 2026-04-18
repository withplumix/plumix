import * as v from "valibot";

import { postInsertSchema } from "../../../db/schema/posts.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CONTENT_BYTES = 1_000_000;
const MAX_EXCERPT_LENGTH = 600;

const trimmedText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

const slugSchema = v.pipe(
  trimmedText(200),
  v.regex(slugPattern, "slug must be kebab-case ASCII"),
);

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
