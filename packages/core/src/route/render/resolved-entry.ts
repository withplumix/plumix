import type { EntryContent } from "@plumix/blocks";

import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type { StoredMeta, WithResolvedMeta } from "../../rpc/meta/core.js";

/** Public-safe author projection — query select narrows away email + auth columns. */
export interface ResolvedAuthor {
  readonly id: number;
  readonly slug: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

// A term plus its pre-resolved archive `url` (basePath-correct). `url` is null
// for a private taxonomy or a nested term needing an ancestor-chain walk —
// `<Link term>` then degrades to its children. Mirrors `ResolvedEntry.url`.
export interface ResolvedTerm extends WithResolvedMeta<Term> {
  readonly url: string | null;
  /** The meta JSON column, as {@link ResolvedEntry.storedMeta}. */
  readonly storedMeta: StoredMeta;
}

// `content` stays loose so non-blocks serializers (TipTap, etc.) keep
// working; `contentBlocks` is the narrowed `EntryContent` (null when
// the stored JSON fails the shape check).
//
// `url` is null when an ancestor-chain DB walk is required — hierarchical
// types with a non-null parentId await a follow-up batched resolver.
export interface ResolvedEntry extends WithResolvedMeta<Entry> {
  /**
   * The meta JSON column as it sits in the row, beside the decoded and
   * reference-hydrated `meta` a template reads. A rule predicate compares
   * against this one: `whereMeta` is typed from the stored shape
   * (`StoredMetaOf`), where a `.returns("date")` field is still its ISO string
   * and a reference is still its id — the primitives `===` can land on, which
   * a `Date` and a hydrated summary are not.
   */
  readonly storedMeta: StoredMeta;
  readonly contentBlocks: EntryContent | null;
  readonly terms: readonly ResolvedTerm[];
  readonly author: ResolvedAuthor;
  readonly url: string | null;
}

// Per-kind data shapes are generic over the entry projection so theme
// authors can narrow `data.entry` to plugin-populated types (e.g.
// `defineTemplate<EntryData<BlogPost>>`). Default to `ResolvedEntry`
// — the framework's internal renderer always sees the default.
export interface EntryData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly kind: "entry";
  readonly entry: TEntry;
}

export interface Pagination {
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface ArchiveData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly kind: "archive";
  readonly contentType: string;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface TaxonomyData<
  TTerm extends ResolvedTerm = ResolvedTerm,
  TEntry extends ResolvedEntry = ResolvedEntry,
> {
  readonly kind: "taxonomy";
  readonly taxonomy: string;
  readonly term: TTerm;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

/**
 * Payload for an author archive (`/authors/{slug}`). Carries the resolved author
 * as the subject (like `TaxonomyData.term`) plus their published entries.
 */
export interface AuthorArchiveData<
  TEntry extends ResolvedEntry = ResolvedEntry,
> {
  readonly kind: "author";
  readonly author: ResolvedAuthor;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

/**
 * Payload for a date archive (`/YYYY[/MM[/DD]]`). `year` is always set;
 * `month`/`day` are 1-based and `null` at a coarser granularity (a year archive
 * has `month: null, day: null`).
 */
export interface DateArchiveData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly kind: "date";
  readonly year: number;
  readonly month: number | null;
  readonly day: number | null;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface FrontPageData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly kind: "frontPage";
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface SearchData<TEntry extends ResolvedEntry = ResolvedEntry> {
  readonly kind: "search";
  readonly query: string;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

/**
 * Base payload for a plugin-registered archive (`registerArchiveType`). The
 * `kind`/`name` discriminate it; a plugin extends this with its own fields
 * (entries, pagination, whatever the archive lists) and declares the extended
 * shape in `ArchiveTypeRegistry` so `forArchiveType(name)` types `data`. Core
 * only ever sees the base — the resolver and template come from the plugin.
 */
export interface CustomArchiveData {
  readonly kind: "custom";
  /** The registered archive-type name (`registerArchiveType(name, …)`). */
  readonly name: string;
}

/**
 * Payload threaded to a theme's `404` / `500` template. Public-safe by
 * shape — there is no Error field, so internal exception messages have
 * no path to the rendered output.
 */
export interface ErrorData {
  readonly kind: "error";
  readonly request: Request;
  readonly hint?: string;
  /**
   * Correlation id for a 5xx — the failing request's telemetry id, so a theme
   * can print it and a user report maps back to the exact failure in the logs.
   * Set only on the server-error path; a 404 leaves it undefined.
   */
  readonly errorId?: string;
}
