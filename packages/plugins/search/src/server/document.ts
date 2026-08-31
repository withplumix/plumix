import type { BlockTextRoster } from "plumix/blocks";
import type { PluginRegistry } from "plumix/plugin";
import { extractBlockText, isEntryContent } from "plumix/blocks";
import { resolveEntryTypeVisibility } from "plumix/plugin";

/**
 * The text an entry contributes beside its title: the excerpt a site wrote by
 * hand, then whatever its blocks declare as text — tags stripped, entities
 * decoded, nested slots walked.
 *
 * Newline-joined so the last word of the excerpt and the first of the body
 * stay two tokens. Content that is not the block envelope — a row nobody has
 * re-saved since the editor cutover — contributes nothing rather than
 * throwing: it is unreadable to the extractor, not to the site.
 */
export function entryDocumentBody(
  entry: { readonly excerpt: string | null; readonly content: unknown },
  roster: BlockTextRoster,
): string {
  const blocks = isEntryContent(entry.content) ? entry.content.blocks : [];
  return [(entry.excerpt ?? "").trim(), extractBlockText(blocks, roster)]
    .filter((part) => part !== "")
    .join("\n");
}

/**
 * Whether entries of this type belong in the index at all.
 *
 * An unregistered type is not searchable, which is what keeps a revision and
 * an autosave out: they are rows in `entries` under types no plugin
 * registers, so their draft text can never reach a public result.
 *
 * Nor is a type under an access policy. A snippet is 24 tokens of body text
 * around a word the visitor chose, so an indexed members-only article would
 * hand an anonymous reader its prose a query at a time — an escalation on
 * core's own search, which reached no further than the excerpt. Keeping the
 * type out of the projection is what makes that impossible rather than
 * merely predicated, and the check is total at the type level: `policyForMatch`
 * reads the type's `access` first and treats an entry's own stored policy as
 * inert without it, so no entry of an unpolicied type can be gated.
 */
export function isSearchableEntryType(
  plugins: PluginRegistry,
  type: string,
): boolean {
  const spec = plugins.entryTypes.get(type);
  if (spec === undefined || spec.access !== undefined) return false;
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
