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

/**
 * Every variable's value for one page. Empty string where the page has none.
 */
export type TitleVariables = Record<TitleVariable, string>;

/**
 * Any `%%...%%` shape, so a mis-cased `%%Title%%` is dropped rather than
 * reaching a search result.
 */
const PLACEHOLDER = /%%([^%\s]+)%%/g;

/**
 * The separator is what the pattern is segmented on, so it is matched before
 * the rest rather than substituted alongside them.
 */
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
 * Null when every variable is empty. The separator joins non-empty parts, so no
 * leading or doubled separators. Unknown names are dropped.
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
