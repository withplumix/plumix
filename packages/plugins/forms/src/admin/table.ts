import type { FormLabelSnapshot, FormSummary } from "../types.js";

/** One column of the inbox table. */
export interface SubmissionColumn {
  readonly key: string;
  readonly label: string;
}

/**
 * The columns a page of submissions is shown under, read from each row's
 * own label snapshot rather than from the live form — so a page mixing
 * two generations of one form still names every column, and a submission
 * whose form is gone is not a table of empty cells.
 */
export function submissionColumns(
  rows: readonly { readonly labels: FormLabelSnapshot }[],
  limit: number,
): readonly SubmissionColumn[] {
  const columns = new Map<string, string>();
  for (const row of rows) {
    for (const [key, field] of Object.entries(row.labels)) {
      if (!columns.has(key)) columns.set(key, field.label);
    }
  }
  return [...columns].slice(0, limit).map(([key, label]) => ({ key, label }));
}

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
