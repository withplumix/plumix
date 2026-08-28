/**
 * Meta-box ids are deduplicated by core, but meta keys are one flat namespace
 * shared by every box on an entity — so the prefix is a convention this plugin
 * has to hold for itself, and every key below spells it out.
 *
 * A leaf module on purpose: the admin chunk reads these keys off the live form
 * and must not pull the server-side reader that sits beside them.
 */
export const SEO_META_KEYS = {
  title: "seo_title",
  description: "seo_description",
  canonical: "seo_canonical",
  ogImage: "seo_og_image",
  noindex: "seo_noindex",
  nofollow: "seo_nofollow",
  schemaType: "seo_schema_type",
} as const;

/**
 * One entity's meta as a read surface hands it back — the entry's resolved
 * meta, a term's raw JSON column, or the editor's own live form values.
 *
 * Not JSON: a resolved bag hands a temporal field back as a `Date` and a
 * reference as its hydrated row, so every value is unproven until read.
 */
export type SeoMetaBag = Readonly<Record<string, unknown>> | null | undefined;
