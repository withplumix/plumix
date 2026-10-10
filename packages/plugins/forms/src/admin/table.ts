import type { FormSummary } from "../types.js";

/**
 * Includes slugs of deleted forms that still have submissions, and
 * always the selected slug, which the status filter could otherwise hide.
 */
export function formFilterOptions(
  declared: readonly FormSummary[],
  countedSlugs: readonly string[],
  selected: string | undefined,
): readonly FormSummary[] {
  const retired = [
    ...new Set([
      ...countedSlugs,
      ...(selected === undefined ? [] : [selected]),
    ]),
  ]
    .filter((slug) => !declared.some((form) => form.slug === slug))
    .map((slug) => ({ slug, title: slug }));
  return [...declared, ...retired];
}
