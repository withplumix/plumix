import * as v from "valibot";

// Slug shape shared across RPC inputs — matches the URL-safe kebab-case
// convention used for post and term slugs. Kept loose on length (200) since
// neither table enforces a tighter limit at the schema level; individual
// routers can tighten further via v.pipe(slugSchema, v.maxLength(N)) if a
// stricter bound emerges.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(slugPattern, "slug must be kebab-case ASCII"),
);
