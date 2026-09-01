import type { BlockTextRoster } from "plumix/blocks";
import type { PluginRegistry, RegisteredEntryType } from "plumix/plugin";
import { extractBlockText, isEntryContent } from "plumix/blocks";
import {
  resolveEntryTypeVisibility,
  resolveTermTaxonomyVisibility,
} from "plumix/plugin";

import type { SearchableMetaField } from "./meta-text.js";
import { extractMetaText } from "./meta-text.js";

/**
 * The text an entry contributes beside its title: the excerpt a site wrote by
 * hand, then whatever its blocks declare as text — tags stripped, entities
 * decoded, nested slots walked — and last the meta fields that opted in.
 *
 * Newline-joined so the last word of one part and the first of the next stay
 * two tokens. Content that is not the block envelope — a row nobody has
 * re-saved since the editor cutover — contributes nothing rather than
 * throwing: it is unreadable to the extractor, not to the site.
 */
export function entryDocumentBody(
  entry: {
    readonly excerpt: string | null;
    readonly content: unknown;
    readonly meta: unknown;
  },
  roster: BlockTextRoster,
  metaFields: readonly SearchableMetaField[],
): string {
  const blocks = isEntryContent(entry.content) ? entry.content.blocks : [];
  return [
    (entry.excerpt ?? "").trim(),
    extractBlockText(blocks, roster),
    extractMetaText(entry.meta, metaFields),
  ]
    .filter((part) => part !== "")
    .join("\n");
}

/**
 * Whether entries of this type belong in the index at all.
 *
 * An unregistered type is not indexable, which is what keeps a revision and
 * an autosave out: they are rows in `entries` under types no plugin
 * registers, so their draft text can never reach any result.
 *
 * Nor is a type under an access policy. A snippet is 24 tokens of body text
 * around a word the visitor chose, so an indexed members-only article would
 * hand an anonymous reader its prose a query at a time — an escalation on
 * core's own search, which reached no further than the excerpt. Keeping the
 * type out of the projection is what makes that impossible rather than
 * merely predicated, and the check is total at the type level: `policyForMatch`
 * reads the type's `access` first and treats an entry's own stored policy as
 * inert without it, so no entry of an unpolicied type can be gated.
 *
 * `excludeFromSearch` deliberately does *not* reach this far. It bounds what a
 * visitor's search page shows, and the admin command palette ranks out of the
 * same index for an editor, whose reach a front-end setting does not bound — a
 * navigation-menu entry has to be findable there. What keeps such a type off
 * the public page is {@link searchableEntryTypes}, applied at read time.
 */
export function isIndexableEntryType(
  plugins: PluginRegistry,
  type: string,
): boolean {
  return isIndexableSpec(plugins.entryTypes.get(type));
}

function isIndexableSpec(
  spec: RegisteredEntryType | undefined,
): spec is RegisteredEntryType {
  return spec !== undefined && spec.access === undefined;
}

/** Every type whose entries the projection holds, for the write side. */
export function indexableEntryTypes(
  plugins: PluginRegistry,
): readonly string[] {
  return [...plugins.entryTypes.keys()].filter((type) =>
    isIndexableEntryType(plugins, type),
  );
}

/**
 * Whether entries of this type may appear in a *visitor's* results — every
 * rule {@link isIndexableEntryType} applies, and the site's own exclusion on
 * top of it.
 */
export function isSearchableEntryType(
  plugins: PluginRegistry,
  type: string,
): boolean {
  const spec = plugins.entryTypes.get(type);
  if (!isIndexableSpec(spec)) return false;
  return !resolveEntryTypeVisibility(spec).excludeFromSearch;
}

/** Every type whose entries may appear in results, for the read-side clamp. */
export function searchableEntryTypes(
  plugins: PluginRegistry,
): readonly string[] {
  return [...plugins.entryTypes.keys()].filter((type) =>
    isSearchableEntryType(plugins, type),
  );
}

/**
 * Whether terms of this taxonomy belong in the index.
 *
 * Defaults from the taxonomy's public flag exactly as the entry-type rule
 * does, so a navigation-menu taxonomy — which is not public — stays out of
 * results without anyone declaring a second thing. The admin command palette
 * asks a different question entirely: an editor searches what they can read.
 */
export function isSearchableTaxonomy(
  plugins: PluginRegistry,
  taxonomy: string,
): boolean {
  const spec = plugins.termTaxonomies.get(taxonomy);
  if (spec === undefined) return false;
  return !resolveTermTaxonomyVisibility(spec).excludeFromSearch;
}

/** Every taxonomy whose terms may appear in results, for the read-side clamp. */
export function searchableTaxonomies(
  plugins: PluginRegistry,
): readonly string[] {
  return [...plugins.termTaxonomies.keys()].filter((taxonomy) =>
    isSearchableTaxonomy(plugins, taxonomy),
  );
}
