import type { EntryContent } from "../../blocks/index.js";
import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type { RoleImages } from "../../images/contract/role-images.js";
import type { StoredMeta, WithResolvedMeta } from "../../meta/contract/bags.js";

/**
 * Public-safe author projection — query select narrows away email + auth
 * columns.
 */
export interface ResolvedAuthor {
  readonly id: number;
  readonly slug: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  /**
   * The author's images by role. The rest of their meta stays behind: a user's
   * meta is not public-safe.
   */
  readonly images: RoleImages;
}

/**
 * `url` is null for a private taxonomy or a nested term needing an ancestor
 * walk; `<Link term>` then degrades to its children.
 */
export interface ResolvedTerm extends WithResolvedMeta<Term> {
  readonly url: string | null;
  /** The meta JSON column, as {@link ResolvedEntry.storedMeta}. */
  readonly storedMeta: StoredMeta;
  /** The term's images by role, as {@link ResolvedEntry.images}. */
  readonly images: RoleImages;
}

/**
 * `content` stays loose for non-blocks serializers; `contentBlocks` is null
 * when the stored JSON fails the shape check. `url` is null where an
 * ancestor-chain walk is needed.
 */
export interface ResolvedEntry extends WithResolvedMeta<Entry> {
  /**
   * The meta column as stored. Rule predicates compare against this: a date
   * field is still its ISO string and a reference its id, primitives `===` can
   * land on.
   */
  readonly storedMeta: StoredMeta;
  readonly contentBlocks: EntryContent | null;
  /**
   * The entry's image for each role its type declares, projected from `meta`
   * at no query cost.
   */
  readonly images: RoleImages;
  readonly terms: readonly ResolvedTerm[];
  readonly author: ResolvedAuthor;
  readonly url: string | null;
}

/**
 * Generic so a theme can narrow `data.entry` to plugin-populated types, e.g.
 * `defineTemplate<EntryData<BlogPost>>`.
 */
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

export interface EntryTypeArchiveData<
  TEntry extends ResolvedEntry = ResolvedEntry,
> {
  readonly kind: "entryType";
  readonly contentType: string;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

export interface TermArchiveData<
  TTerm extends ResolvedTerm = ResolvedTerm,
  TEntry extends ResolvedEntry = ResolvedEntry,
> {
  readonly kind: "term";
  readonly taxonomy: string;
  readonly term: TTerm;
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
}

/**
 * Payload for an author archive (`/authors/{slug}`). Carries the resolved
 * author as the subject (like `TermArchiveData.term`) plus their published
 * entries.
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
 * Base payload for a plugin archive. Extend it and declare the shape in
 * `ArchiveTypeRegistry` so `forArchiveType(name)` types `data`.
 */
export interface ArchiveTypeData {
  readonly kind: "archiveType";
  /** The registered archive-type name (`registerArchiveType(name, …)`). */
  readonly name: string;
  /**
   * Facts core cannot derive: the 1-based page index, and a visitor's typed
   * query. `PageFacts` reports both so this archive is classified like every
   * other page.
   */
  readonly page?: number;
  readonly query?: string;
}

/**
 * What a theme receives for a view: core wraps the `data` its `resolve`
 * returned with the `name` and route `params`. Declare the shape in
 * `ViewRegistry`.
 */
export interface ViewData<TData = unknown> {
  readonly kind: "view";
  /** The registered view name (`registerView(name, …)`). */
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly data: TData;
}

/**
 * An archive core listed: a plugin's fields plus the `entries` and
 * `pagination` built-in archives carry, so theme components work on both.
 * Declare the extension in `ArchiveTypeRegistry`.
 */
export interface ListingArchiveData<
  TEntry extends ResolvedEntry = ResolvedEntry,
> extends ArchiveTypeData {
  readonly entries: readonly TEntry[];
  readonly pagination: Pagination;
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
   * Correlation id for a 5xx, the request's telemetry id, so a user report maps
   * to the logs. Unset on a 404.
   */
  readonly errorId?: string;
}
