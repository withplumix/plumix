import type { FormSummary } from "../types.js";

/**
 * What the form filter offers: every form the registry declares now,
 * then every slug that only has a backlog — a form deleted since is
 * still how its submissions are reached, under its slug because there is
 * no longer a title to call it by.
 *
 * The slug being filtered by is always among them. Slugs are counted
 * within the status filter, so a form with nothing under the status in
 * view would otherwise leave the list it is selected in.
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
