import * as v from "valibot";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const termIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

const taxonomySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(100),
);

const nameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
);

const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(slugPattern, "slug must be kebab-case ASCII"),
);

const descriptionSchema = v.nullable(v.pipe(v.string(), v.maxLength(10_000)));

export const termListInputSchema = v.object({
  taxonomy: taxonomySchema,
  parentId: v.optional(v.nullable(termIdSchema)),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
    50,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const termGetInputSchema = v.object({ id: termIdSchema });

export const termCreateInputSchema = v.object({
  taxonomy: taxonomySchema,
  name: nameSchema,
  slug: slugSchema,
  description: v.optional(descriptionSchema),
  parentId: v.optional(v.nullable(termIdSchema)),
});

export const termUpdateInputSchema = v.object({
  id: termIdSchema,
  name: v.optional(nameSchema),
  slug: v.optional(slugSchema),
  description: v.optional(descriptionSchema),
  parentId: v.optional(v.nullable(termIdSchema)),
});

export const termDeleteInputSchema = v.object({ id: termIdSchema });

export type TermListInput = v.InferOutput<typeof termListInputSchema>;
export type TermGetInput = v.InferOutput<typeof termGetInputSchema>;
export type TermCreateInput = v.InferOutput<typeof termCreateInputSchema>;
export type TermUpdateInput = v.InferOutput<typeof termUpdateInputSchema>;
export type TermDeleteInput = v.InferOutput<typeof termDeleteInputSchema>;
