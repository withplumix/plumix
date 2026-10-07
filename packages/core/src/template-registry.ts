import type {
  ArchiveTypeData,
  ResolvedEntry,
  ResolvedTerm,
  ViewData,
} from "./route/contract/resolved-entry.js";

/**
 * Augmentable map of registered entry-type names to their projection types.
 * Core seeds `post`/`page`; plugins and apps augment it alongside their
 * `registerEntryType` call, so `forEntryType` autocompletes the name, rejects
 * typos at compile time, and types `data.entry`. A name registered without an
 * `entry` projection degrades to the base `ResolvedEntry`.
 *
 * ```ts
 * declare module "plumix" {
 *   interface EntryTypeRegistry {
 *     product: { entry: Product };
 *   }
 * }
 * ```
 */
export interface EntryTypeRegistry {
  post: { entry: ResolvedEntry };
  page: { entry: ResolvedEntry };
}

/**
 * Augmentable map of registered taxonomy names to their term projection types.
 * Carries the term shape (`data.term`), not the archive entries — a taxonomy
 * can span multiple entry types, so `data.entries` stays the base
 * `ResolvedEntry[]`, narrowable per-template.
 *
 * ```ts
 * declare module "plumix" {
 *   interface TermTaxonomyRegistry {
 *     genre: { term: Genre };
 *   }
 * }
 * ```
 */
export interface TermTaxonomyRegistry {
  category: { term: ResolvedTerm };
  tag: { term: ResolvedTerm };
}

/**
 * Augmentable map of plugin-registered archive-type names to their data
 * projection. A plugin augments it alongside its `registerArchiveType` call so
 * `forArchiveType` autocompletes the name, rejects typos, and types `data`. The
 * projection must extend {@link ArchiveTypeData}; a name registered without a
 * `data` projection degrades to the base.
 *
 * ```ts
 * declare module "plumix" {
 *   interface ArchiveTypeRegistry {
 *     "event-series": { data: EventSeriesData };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface ArchiveTypeRegistry {}

/**
 * Augmentable map of plugin-registered view names to the `data` their
 * `resolve` returns. A plugin augments it alongside its `registerView` call so
 * `forView(name)` types `data.data` and `registerView` holds the resolver to
 * the same shape. A name with no entry here still registers and templates,
 * with `data` left `unknown`.
 *
 * ```ts
 * declare module "plumix" {
 *   interface ViewRegistry {
 *     compareShare: { data: CompareShare };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface ViewRegistry {}

export type EntryTypeName = keyof EntryTypeRegistry;
export type TermTaxonomyName = keyof TermTaxonomyRegistry;
export type ArchiveTypeName = keyof ArchiveTypeRegistry;

/** The data projection for a registered archive type, defaulting to the base. */
export type ArchiveDataOf<K extends ArchiveTypeName> =
  ArchiveTypeRegistry[K] extends { data: infer D extends ArchiveTypeData }
    ? D
    : ArchiveTypeData;

/** What a view's `resolve` returns as `data`, `unknown` for an undeclared name. */
export type ViewResolvedDataOf<K extends string> = K extends keyof ViewRegistry
  ? ViewRegistry[K] extends { data: infer D }
    ? D
    : unknown
  : unknown;

/** The template data for a view, typed from `ViewRegistry` when declared there. */
export type ViewDataOf<K extends string> = ViewData<ViewResolvedDataOf<K>>;

/** The entry projection for a registered type, defaulting to `ResolvedEntry`. */
export type EntryProjection<K extends EntryTypeName> =
  EntryTypeRegistry[K] extends { entry: infer E extends ResolvedEntry }
    ? E
    : ResolvedEntry;

/** The term projection for a registered taxonomy, defaulting to `ResolvedTerm`. */
export type TermProjection<K extends TermTaxonomyName> =
  TermTaxonomyRegistry[K] extends { term: infer T extends ResolvedTerm }
    ? T
    : ResolvedTerm;
