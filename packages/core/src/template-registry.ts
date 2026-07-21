import type {
  CustomArchiveData,
  ResolvedEntry,
  ResolvedTerm,
} from "./route/render/resolved-entry.js";

/**
 * Augmentable map of registered entry-type names to their projection types.
 * Core seeds `post`/`page`; plugins and apps augment it alongside their
 * `registerEntryType` call, so `forEntryType` autocompletes the name, rejects
 * typos at compile time, and types `data.entry`. A name registered without an
 * `entry` projection degrades to the base `ResolvedEntry`.
 *
 * ```ts
 * declare module "@plumix/core" {
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
 */
export interface TermTaxonomyRegistry {
  category: { term: ResolvedTerm };
  tag: { term: ResolvedTerm };
}

/**
 * Augmentable map of plugin-registered archive-type names to their data
 * projection. A plugin augments it alongside its `registerArchiveType` call so
 * `forArchiveType` autocompletes the name, rejects typos, and types `data`. The
 * projection must extend {@link CustomArchiveData}; a name registered without a
 * `data` projection degrades to the base.
 *
 * ```ts
 * declare module "@plumix/core" {
 *   interface ArchiveTypeRegistry {
 *     "event-series": { data: EventSeriesData };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface ArchiveTypeRegistry {}

export type EntryTypeName = keyof EntryTypeRegistry;
export type TermTaxonomyName = keyof TermTaxonomyRegistry;
export type ArchiveTypeName = keyof ArchiveTypeRegistry;

/** The data projection for a registered archive type, defaulting to the base. */
export type ArchiveDataOf<K extends ArchiveTypeName> =
  ArchiveTypeRegistry[K] extends { data: infer D extends CustomArchiveData }
    ? D
    : CustomArchiveData;

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

/**
 * The meta shape for a registered entry type, used to type `whereMeta` keys and
 * values. Degrades to a permissive record when the type declares no `meta`
 * projection (as core's `post`/`page` do).
 */
export type MetaOf<K extends EntryTypeName> = EntryTypeRegistry[K] extends {
  meta: infer M;
}
  ? M
  : Record<string, unknown>;

/**
 * The meta shape for a registered taxonomy, used to type `whereMeta` keys and
 * values on term archives. Degrades to a permissive record when the taxonomy
 * declares no `meta` projection (as core's `category`/`tag` do).
 */
export type TermMetaOf<K extends TermTaxonomyName> =
  TermTaxonomyRegistry[K] extends {
    meta: infer M;
  }
    ? M
    : Record<string, unknown>;
