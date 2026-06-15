import type { EntryContent } from "@plumix/blocks";

import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";

/** Public-safe author projection — query select narrows away email + auth columns. */
export interface ResolvedAuthor {
  readonly id: number;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

// A term plus its pre-resolved archive `url` (basePath-correct). `url` is null
// for a private taxonomy or a nested term needing an ancestor-chain walk —
// `<Link term>` then degrades to its children. Mirrors `ResolvedEntry.url`.
export interface ResolvedTerm extends Term {
  readonly url: string | null;
}

// `content` stays loose so non-blocks serializers (TipTap, etc.) keep
// working; `contentBlocks` is the narrowed `EntryContent` (null when
// the stored JSON fails the shape check).
//
// `url` is null when an ancestor-chain DB walk is required — hierarchical
// types with a non-null parentId await a follow-up batched resolver.
export interface ResolvedEntry extends Entry {
  readonly contentBlocks: EntryContent | null;
  readonly terms: readonly ResolvedTerm[];
  readonly author: ResolvedAuthor;
  readonly url: string | null;
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
  readonly term: ResolvedTerm;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface FrontPageData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface SearchData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly query: string;
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
