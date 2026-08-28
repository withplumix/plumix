/**
 * The variables a title pattern can name. `%%title%%` is the title core
 * resolved for the page; the rest are the page's own subject, empty on a page
 * that has none.
 */
export const TITLE_VARIABLES = [
  "title",
  "sitename",
  "sep",
  "term",
  "author",
  "date",
  "searchphrase",
  "count",
] as const;

type TitleVariable = (typeof TITLE_VARIABLES)[number];

/** Every variable's value for one page. Empty string where the page has none. */
export type TitleVariables = Record<TitleVariable, string>;

// Anything in `%%...%%` shape is a variable, not only the names that resolve —
// so `%%Title%%` and `%%term-title%%` are dropped like `%%nope%%` rather than
// surviving into a search result. Mis-casing is the likeliest author slip.
const PLACEHOLDER = /%%([^%\s]+)%%/g;

// The separator is what the pattern is segmented on, so it is matched before
// the rest rather than substituted alongside them.
const SEPARATOR_PLACEHOLDER = /%%sep%%/g;

function isTitleVariable(name: string): name is TitleVariable {
  return (TITLE_VARIABLES as readonly string[]).includes(name);
}

function substitute(segment: string, variables: TitleVariables): string {
  return segment
    .replace(PLACEHOLDER, (_match, name: string) =>
      isTitleVariable(name) ? variables[name] : "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a title pattern against one page's variables, or null when it says
 * nothing — an empty pattern, or one whose every variable is empty on this
 * page, in which case the caller keeps the title core resolved.
 *
 * The separator is a join, not a substitution: the pattern is cut into the
 * parts it separates, the parts this page has nothing for drop out, and what
 * is left is joined back. So a pattern written for the page that has every
 * part degrades cleanly on the one that does not — no leading separator, and
 * no doubled one where the middle part was empty — while a separator character
 * the page's own text carries is never touched.
 *
 * A name that is not a variable is dropped rather than emitted: a pattern is
 * authored in an admin field, and shipping `%%titel%%` into a SERP is worse
 * than shipping a shorter title.
 */
export function renderTitlePattern(
  pattern: string,
  variables: TitleVariables,
): string | null {
  const parts = pattern
    .split(SEPARATOR_PLACEHOLDER)
    .map((segment) => substitute(segment, variables))
    .filter((segment) => segment !== "");
  const title = parts.join(` ${variables.sep} `).replace(/\s+/g, " ").trim();
  return title === "" ? null : title;
}
