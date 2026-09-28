// Container tags a block's root element may be rendered as (Builder's tag-name
// control). Restricted to generic/sectioning containers — no interactive, void,
// table, or script-ish elements — so an author override can't break layout or
// smuggle behavior. A value outside this set falls back to the block's default.
export const ROOT_TAGS = [
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "main",
  "figure",
] as const;

export type RootTag = (typeof ROOT_TAGS)[number];

const ROOT_TAG_SET: ReadonlySet<string> = new Set(ROOT_TAGS);

/** The tag if it's an allowlisted root container, else `undefined` (caller
 *  falls back to the block's default element). */
export function resolveRootTag(name: string | undefined): RootTag | undefined {
  return name !== undefined && ROOT_TAG_SET.has(name)
    ? (name as RootTag)
    : undefined;
}
