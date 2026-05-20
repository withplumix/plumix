import * as v from "valibot";

import type { EntryStatus } from "@plumix/core/schema";
import { idParam } from "@plumix/core/validation";

// Mirrors the server's `slugSchema` — lowercase ASCII alphanumerics
// separated by single dashes.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const postEditorSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300)),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(200),
    v.regex(
      SLUG_PATTERN,
      "Slug must be lowercase letters, numbers, and dashes",
    ),
  ),
  content: v.nullable(v.unknown()),
  excerpt: v.optional(v.pipe(v.string(), v.maxLength(600)), ""),
  status: v.picklist(["draft", "published", "scheduled", "trash"] as const),
  meta: v.record(v.string(), v.unknown()),
  terms: v.record(v.string(), v.array(v.number())),
  parentId: v.nullable(idParam),
});

export type PostEditorValues = v.InferOutput<typeof postEditorSchema>;

export const POST_EDITOR_STATUSES: readonly EntryStatus[] = [
  "draft",
  "published",
  "scheduled",
  "trash",
];
