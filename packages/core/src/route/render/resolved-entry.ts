import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";

/** Public-safe author projection — query select narrows away email + auth columns. */
export interface ResolvedAuthor {
  readonly id: number;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

export interface ResolvedEntry extends Entry {
  readonly terms: readonly Term[];
  readonly author: ResolvedAuthor;
}

// Per-kind data shapes are generic over the entry projection so theme
// authors can narrow `data.entry` to plugin-populated types (e.g.
// `defineTemplate<SingleData<BlogPost>>`). Default to `ResolvedEntry`
// — the framework's internal renderer always sees the default.
export interface SingleData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly entry: TEntry;
}

export interface Pagination {
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface ArchiveData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly contentType: string;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface TaxonomyData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly taxonomy: string;
  readonly term: Term;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface FrontPageData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

/**
 * Payload threaded to a theme's `404` / `500` template. Public-safe by
 * shape — there is no Error field, so internal exception messages have
 * no path to the rendered output.
 */
export interface ErrorData {
  readonly request: Request;
  readonly hint?: string;
}
