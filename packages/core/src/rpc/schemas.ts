import * as v from "valibot";

import { SLUG_MAX_LENGTH, slugPattern } from "./validation.js";

// Slug shape shared across RPC inputs — matches the URL-safe kebab-case
// convention used for post and term slugs. Bounds live in `validation.ts`
// (the shared client+server field module) so admin forms validate the same
// rules; individual routers can tighten further via
// v.pipe(slugSchema, v.maxLength(N)) if a stricter bound emerges.
export const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(SLUG_MAX_LENGTH),
  v.regex(slugPattern, "slug must be kebab-case ASCII"),
);
