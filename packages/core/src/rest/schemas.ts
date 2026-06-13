import * as v from "valibot";

const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;

// Path param only. Pagination is read from the query string directly (see
// `readPagination`) so the surface doesn't depend on per-adapter query coercion.
export const entryCollectionParamsSchema = v.object({ type: v.string() });
export const entryItemParamsSchema = v.object({
  type: v.string(),
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
});

export const entriesListEnvelopeSchema = v.object({
  data: v.array(publicEntrySchema),
  meta: v.object({ page: v.number(), per_page: v.number() }),
  links: v.object({
    self: v.string(),
    next: v.optional(v.string()),
    prev: v.optional(v.string()),
  }),
});

export type PublicAuthor = v.InferOutput<typeof publicAuthorSchema>;
export type PublicEntry = v.InferOutput<typeof publicEntrySchema>;

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
