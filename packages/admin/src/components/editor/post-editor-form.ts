import * as v from "valibot";

import { ENTRY_STATUSES } from "@plumix/core/manifest";
import { idParam } from "@plumix/core/validation";

import { slugField } from "../../lib/slug.js";

export const POST_EDITOR_STATUSES = ENTRY_STATUSES;

export const postEditorSchema = v.object({
  // Empty allowed — a draft may be untitled (matches the server's create /
  // update schema). Without this, a freshly-created untitled entry is an
  // invalid form state, so autosave / publish silently no-op.
  title: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  slug: slugField,
  content: v.nullable(v.unknown()),
  excerpt: v.optional(v.pipe(v.string(), v.maxLength(600)), ""),
  status: v.picklist(POST_EDITOR_STATUSES),
  meta: v.record(v.string(), v.unknown()),
  terms: v.record(v.string(), v.array(v.number())),
  parentId: v.nullable(idParam),
});

export type PostEditorValues = v.InferOutput<typeof postEditorSchema>;
