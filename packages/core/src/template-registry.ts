import type {
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
export interface TaxonomyRegistry {
  category: { term: ResolvedTerm };
  tag: { term: ResolvedTerm };
}

export type EntryTypeName = keyof EntryTypeRegistry;
export type TaxonomyName = keyof TaxonomyRegistry;

/** The entry projection for a registered type, defaulting to `ResolvedEntry`. */
export type EntryProjection<K extends EntryTypeName> =
  EntryTypeRegistry[K] extends { entry: infer E extends ResolvedEntry }
    ? E
    : ResolvedEntry;

/** The term projection for a registered taxonomy, defaulting to `ResolvedTerm`. */
export type TermProjection<K extends TaxonomyName> =
  TaxonomyRegistry[K] extends { term: infer T extends ResolvedTerm }
    ? T
    : ResolvedTerm;
