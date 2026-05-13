/**
 * `ArchiveProps` is the discriminated union the shared `archive` /
 * `index` fallback templates receive. Specific templates
 * (`taxonomy-category.tsx`, `single-post.tsx`, …) stay strictly typed
 * via `TemplateProps<K>` — themes that fall through to `archive` accept
 * the wider shape and narrow with `isTaxonomy` / `isEntryArchive`.
 *
 * Mirrors WordPress's `is_tax()` / `is_post_type_archive()` conditional
 * tags, but typed: each predicate also acts as a TypeScript type guard
 * so a single `if (isTaxonomy(props))` branch unlocks `props.term` and
 * `props.taxonomy` without casts.
 *
 * The shape is intentionally minimal at this slice — it carries the
 * fields a fallback template needs to discriminate and render. Slices
 * that add pagination, terms-as-children, and meta widen this without
 * breaking the discriminator.
 */

export type ArchiveProps = EntryArchiveProps | TaxonomyArchiveProps;

export interface EntryArchiveProps {
  readonly kind: "entry-archive";
  readonly entryType: string;
  readonly entries: readonly ArchiveEntry[];
}

export interface TaxonomyArchiveProps {
  readonly kind: "taxonomy";
  readonly taxonomy: string;
  readonly term: { readonly name: string; readonly slug: string };
  readonly entries: readonly ArchiveEntry[];
}

export interface ArchiveEntry {
  readonly title: string;
  readonly slug: string;
}

export function isTaxonomy(
  props: ArchiveProps,
  taxonomy?: string,
): props is TaxonomyArchiveProps {
  if (props.kind !== "taxonomy") return false;
  if (taxonomy === undefined) return true;
  return props.taxonomy === taxonomy;
}

export function isEntryArchive(
  props: ArchiveProps,
  entryType?: string,
): props is EntryArchiveProps {
  if (props.kind !== "entry-archive") return false;
  if (entryType === undefined) return true;
  return props.entryType === entryType;
}
