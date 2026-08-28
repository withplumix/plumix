import type { PageFacts } from "plumix";
import type { Label } from "plumix/i18n";
import type { MetaBoxFieldInput } from "plumix/plugin";

import type { SeoMetaBag } from "./meta-keys.js";
import type { SchemaType } from "./schema.js";
import { SEO_META_KEYS } from "./meta-keys.js";
import { SCHEMA_TYPES, toSchemaType } from "./schema.js";
import { nonEmpty } from "./settings.js";

export type { SeoMetaBag } from "./meta-keys.js";
export { SEO_META_KEYS } from "./meta-keys.js";

/** What an editor answered for one entry or term. Every arm optional. */
export interface SeoOverrides {
  /** Replaces the page title in `<title>` and `og:title`. */
  readonly title: string | null;
  /** Replaces the excerpt-then-tagline description. */
  readonly description: string | null;
  /** Replaces the canonical URL core derived from the request path. */
  readonly canonical: string | null;
  /** Outranks a generated card and the site default. */
  readonly ogImage: string | null;
  readonly noindex: boolean;
  readonly nofollow: boolean;
  /** Replaces the schema.org type the structured-data graph inferred. */
  readonly schemaType: SchemaType | null;
}

const D = {
  boxLabel: { id: "plugin.seo.box.label", message: "Search & social" },
  boxDescription: {
    id: "plugin.seo.box.description",
    message: "How this appears in search results and when it is shared.",
  },
  title: { id: "plugin.seo.box.title.label", message: "Search title" },
  titleDescription: {
    id: "plugin.seo.box.title.description",
    message: "Shown in search results instead of the title above.",
  },
  description: {
    id: "plugin.seo.box.description_field.label",
    message: "Search description",
  },
  descriptionDescription: {
    id: "plugin.seo.box.description_field.description",
    message: "The snippet under the title. Falls back to the excerpt.",
  },
  canonical: {
    id: "plugin.seo.box.canonical.label",
    message: "Canonical URL",
  },
  canonicalDescription: {
    id: "plugin.seo.box.canonical.description",
    message: "Point search engines at the original when this is a copy.",
  },
  ogImage: { id: "plugin.seo.box.og_image.label", message: "Social image URL" },
  ogImageDescription: {
    id: "plugin.seo.box.og_image.description",
    message: "The picture shown when this is shared.",
  },
  noindex: {
    id: "plugin.seo.box.noindex.label",
    message: "Hide from search engines",
  },
  noindexDescription: {
    id: "plugin.seo.box.noindex.description",
    message: "Also drops this from the sitemap.",
  },
  nofollow: {
    id: "plugin.seo.box.nofollow.label",
    message: "Do not follow links on this page",
  },
  schemaType: {
    id: "plugin.seo.box.schema_type.label",
    message: "Content type",
  },
  schemaTypeDescription: {
    id: "plugin.seo.box.schema_type.description",
    message: "How structured data files this entry. Defaults to an article.",
  },
} as const satisfies Record<string, Label>;

// Long enough for a title or a description a search engine will truncate
// anyway, and for any URL — the cap is against an adversarial payload, not an
// editorial rule.
const TEXT_MAX = 300;
const URL_MAX = 500;

/** What an editor answers about any subject — the term box's whole set. */
export const SEO_META_FIELDS: readonly MetaBoxFieldInput[] = [
  {
    key: SEO_META_KEYS.title,
    type: "string",
    inputType: "text",
    label: D.title,
    description: D.titleDescription,
    maxLength: TEXT_MAX,
  },
  {
    key: SEO_META_KEYS.description,
    type: "string",
    inputType: "textarea",
    label: D.description,
    description: D.descriptionDescription,
    maxLength: TEXT_MAX,
  },
  {
    key: SEO_META_KEYS.canonical,
    type: "string",
    inputType: "url",
    label: D.canonical,
    description: D.canonicalDescription,
    maxLength: URL_MAX,
  },
  {
    key: SEO_META_KEYS.ogImage,
    type: "string",
    inputType: "url",
    label: D.ogImage,
    description: D.ogImageDescription,
    maxLength: URL_MAX,
  },
  {
    key: SEO_META_KEYS.noindex,
    type: "boolean",
    inputType: "toggle",
    label: D.noindex,
    description: D.noindexDescription,
    default: false,
  },
  {
    key: SEO_META_KEYS.nofollow,
    type: "boolean",
    inputType: "toggle",
    label: D.nofollow,
    default: false,
  },
];

/**
 * The entry box: the shared set plus the schema type. Only an entry has an
 * article piece in the structured-data graph for the choice to retype, so a
 * term box carrying the control would offer an answer nothing reads.
 */
export const SEO_ENTRY_FIELDS: readonly MetaBoxFieldInput[] = [
  ...SEO_META_FIELDS,
  {
    key: SEO_META_KEYS.schemaType,
    type: "string",
    inputType: "select",
    label: D.schemaType,
    description: D.schemaTypeDescription,
    // schema.org type names, not prose — the same word in every language, so
    // they are spelled here rather than sent through the catalogs.
    options: SCHEMA_TYPES.map((type) => ({ value: type, label: type })),
  },
];

/** The box's own label and description, shared by both registrations. */
export const SEO_BOX_LABELS = {
  label: D.boxLabel,
  description: D.boxDescription,
} as const;

/** Read one entity's SEO answers off its meta bag. */
export function readSeoOverrides(meta: SeoMetaBag): SeoOverrides {
  const bag = meta ?? {};
  return {
    title: nonEmpty(bag[SEO_META_KEYS.title]),
    description: nonEmpty(bag[SEO_META_KEYS.description]),
    canonical: nonEmpty(bag[SEO_META_KEYS.canonical]),
    ogImage: nonEmpty(bag[SEO_META_KEYS.ogImage]),
    // Anything but a stored `true` leaves the page where it was: a flag nobody
    // set must not read as one somebody turned on.
    noindex: bag[SEO_META_KEYS.noindex] === true,
    nofollow: bag[SEO_META_KEYS.nofollow] === true,
    // Narrowed to the roster: a stored value nothing offered is not an answer,
    // and an unvetted string would become a schema.org type on the page.
    schemaType: toSchemaType(nonEmpty(bag[SEO_META_KEYS.schemaType])),
  };
}

/**
 * The SEO answers for a page — an entry page has an entry, a term archive has
 * a term, and no page has both, so whichever is present is the subject an
 * editor answered for. Read here rather than at each consumer so the head and
 * the predicate cannot pick different subjects.
 */
export function readPageOverrides(facts: PageFacts): SeoOverrides {
  return readSeoOverrides((facts.entry ?? facts.term)?.meta);
}
