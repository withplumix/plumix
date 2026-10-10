import type {
  ArchiveTypeData,
  ResolvedEntry,
  ResolvedTerm,
  ViewData,
} from "./route/contract/resolved-entry.js";

/**
 * Augment alongside `registerEntryType` so `forEntryType` checks the name and
 * types `data.entry`. A name without an `entry` projection gets
 * `ResolvedEntry`.
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
 * Carries the term shape only: a taxonomy can span entry types, so
 * `data.entries` stays `ResolvedEntry[]`.
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
 * Augment alongside `registerArchiveType`. The projection must extend
 * {@link ArchiveTypeData}; a name without one degrades to the base.
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
 * Augment alongside `registerView` so `forView(name)` types `data.data`. A
 * name with no entry still registers, with `data` left `unknown`.
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

/**
 * The data projection for a registered archive type, defaulting to the base.
 */
export type ArchiveDataOf<K extends ArchiveTypeName> =
  ArchiveTypeRegistry[K] extends { data: infer D extends ArchiveTypeData }
    ? D
    : ArchiveTypeData;

/**
 * What a view's `resolve` returns as `data`, `unknown` for an undeclared name.
 */
export type ViewResolvedDataOf<K extends string> = K extends keyof ViewRegistry
  ? ViewRegistry[K] extends { data: infer D }
    ? D
    : unknown
  : unknown;

/**
 * The template data for a view, typed from `ViewRegistry` when declared there.
 */
export type ViewDataOf<K extends string> = ViewData<ViewResolvedDataOf<K>>;

/**
 * The entry projection for a registered type, defaulting to `ResolvedEntry`.
 */
export type EntryProjection<K extends EntryTypeName> =
  EntryTypeRegistry[K] extends { entry: infer E extends ResolvedEntry }
    ? E
    : ResolvedEntry;

/**
 * The term projection for a registered taxonomy, defaulting to `ResolvedTerm`.
 */
export type TermProjection<K extends TermTaxonomyName> =
  TermTaxonomyRegistry[K] extends { term: infer T extends ResolvedTerm }
    ? T
    : ResolvedTerm;
