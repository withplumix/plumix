/**
 * Meta keys share one flat namespace per entity, so the prefix is ours to hold.
 * A leaf module so the admin chunk doesn't pull server code.
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
 * Not JSON: a resolved bag returns temporal fields as `Date` and references as
 * hydrated rows, so every value is unproven until read.
 */
export type SeoMetaBag = Readonly<Record<string, unknown>> | null | undefined;
