import type { BlockTextRoster } from "plumix/blocks";
import type { PluginRegistry, RegisteredEntryType } from "plumix/plugin";
import { extractBlockText, isEntryContent } from "plumix/blocks";

import type { SearchableMetaField } from "./meta-text.js";
import { extractMetaText } from "./meta-text.js";

/**
 * Content that is not the block envelope contributes nothing rather than
 * throwing.
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
 * Excludes unregistered types (revisions, autosaves) and access-policed ones,
 * whose snippets would leak gated prose. Ignores `excludeFromSearch`: the admin
 * palette reads the same index.
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

/** {@link isIndexableEntryType} plus the site's `excludeFromSearch`. */
export function isSearchableEntryType(
  plugins: PluginRegistry,
  type: string,
): boolean {
  const spec = plugins.entryTypes.get(type);
  if (!isIndexableSpec(spec)) return false;
  return !spec.excludeFromSearch;
}

/** Every type whose entries may appear in results, for the read-side clamp. */
export function searchableEntryTypes(
  plugins: PluginRegistry,
): readonly string[] {
  return [...plugins.entryTypes.keys()].filter((type) =>
    isSearchableEntryType(plugins, type),
  );
}

export function isSearchableTaxonomy(
  plugins: PluginRegistry,
  taxonomy: string,
): boolean {
  const spec = plugins.termTaxonomies.get(taxonomy);
  if (spec === undefined) return false;
  return !spec.excludeFromSearch;
}

/**
 * Every taxonomy whose terms may appear in results, for the read-side clamp.
 */
export function searchableTaxonomies(
  plugins: PluginRegistry,
): readonly string[] {
  return [...plugins.termTaxonomies.keys()].filter((taxonomy) =>
    isSearchableTaxonomy(plugins, taxonomy),
  );
}
