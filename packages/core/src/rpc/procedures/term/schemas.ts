import * as v from "valibot";

import { slugSchema } from "../../schemas.js";
import { idParam } from "../../validation.js";

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

const descriptionSchema = v.nullable(v.pipe(v.string(), v.maxLength(10_000)));

export const termListInputSchema = v.object({
  taxonomy: taxonomySchema,
  parentId: v.optional(v.nullable(idParam)),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
    50,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const termGetInputSchema = v.object({ id: idParam });

export const termCreateInputSchema = v.object({
  taxonomy: taxonomySchema,
  name: nameSchema,
  slug: slugSchema,
  description: v.optional(descriptionSchema),
  parentId: v.optional(v.nullable(idParam)),
});

export const termUpdateInputSchema = v.object({
  id: idParam,
  name: v.optional(nameSchema),
  slug: v.optional(slugSchema),
  description: v.optional(descriptionSchema),
  parentId: v.optional(v.nullable(idParam)),
});

export const termDeleteInputSchema = v.object({ id: idParam });

export type TermListInput = v.InferOutput<typeof termListInputSchema>;
export type TermGetInput = v.InferOutput<typeof termGetInputSchema>;
export type TermCreateInput = v.InferOutput<typeof termCreateInputSchema>;
export type TermUpdateInput = v.InferOutput<typeof termUpdateInputSchema>;
export type TermDeleteInput = v.InferOutput<typeof termDeleteInputSchema>;
