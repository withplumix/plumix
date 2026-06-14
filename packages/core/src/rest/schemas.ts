import * as v from "valibot";

const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;

// Path params only. Entry types and taxonomies share the top-level
// `{collection}` rest_base namespace. Pagination is read from the query string
// directly (see `readPagination`) so the surface doesn't depend on per-adapter
// query coercion.
export const collectionParamsSchema = v.object({ collection: v.string() });
export const collectionItemParamsSchema = v.object({
  collection: v.string(),
  id: v.string(),
});

// The output schemas ARE the public allowlist (default-deny): only these
// fields can ever leave the surface, and they double as the documented
// response shapes in the generated OpenAPI spec.
export const publicAuthorSchema = v.object({
  id: v.number(),
  name: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
});

// Compact term shape, used both as a top-level resource and embedded on entries.
export const publicTermSchema = v.object({
  id: v.number(),
  name: v.string(),
  slug: v.string(),
});

export const publicEntrySchema = v.object({
  id: v.number(),
  type: v.string(),
  slug: v.string(),
  title: v.string(),
  excerpt: v.nullable(v.string()),
  content: v.unknown(),
  status: v.string(),
  publishedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
  author: v.nullable(publicAuthorSchema),
  // Associations are embedded, never nested as their own sub-resource.
  terms: v.record(v.string(), v.array(publicTermSchema)),
  // Only meta fields whitelisted with `showInApi` reach this map (default-deny).
  meta: v.record(v.string(), v.unknown()),
});

function listEnvelopeSchema<TItem extends v.GenericSchema>(item: TItem) {
  return v.object({
    data: v.array(item),
    meta: v.object({ page: v.number(), per_page: v.number() }),
    links: v.object({
      self: v.string(),
      next: v.optional(v.string()),
      prev: v.optional(v.string()),
    }),
  });
}

export const entriesListEnvelopeSchema = listEnvelopeSchema(publicEntrySchema);
export const termsListEnvelopeSchema = listEnvelopeSchema(publicTermSchema);

export type PublicAuthor = v.InferOutput<typeof publicAuthorSchema>;
export type PublicEntry = v.InferOutput<typeof publicEntrySchema>;
export type PublicTerm = v.InferOutput<typeof publicTermSchema>;

interface Pagination {
  readonly page: number;
  readonly perPage: number;
  readonly offset: number;
}

export function readPagination(url: URL): Pagination {
  const page = clampInt(
    url.searchParams.get("page"),
    1,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const perPage = clampInt(
    url.searchParams.get("per_page"),
    DEFAULT_PER_PAGE,
    1,
    MAX_PER_PAGE,
  );
  return { page, perPage, offset: (page - 1) * perPage };
}

// Non-integer or out-of-range values fall back / clamp rather than erroring —
// pagination params are ergonomic hints, not a place to 400 a content read.
function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
