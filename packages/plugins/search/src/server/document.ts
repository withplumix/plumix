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
 */
export function isSearchableEntryType(
  plugins: PluginRegistry,
  type: string,
): boolean {
  const spec = plugins.entryTypes.get(type);
  return (
    spec !== undefined && !resolveEntryTypeVisibility(spec).excludeFromSearch
  );
}
