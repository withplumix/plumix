import type { FormLabelSnapshot } from "./types.js";

/** One column of answers, named by the question that produced them. */
export interface SubmissionColumn {
  readonly key: string;
  readonly label: string;
}

/**
 * The columns a set of submissions is read under, taken from each row's
 * own label snapshot rather than from the live form — so a page mixing
 * two generations of one form still names every column, and a submission
 * whose form is gone is not a table of empty cells.
 *
 * `limit` is the inbox's, where only the first few answers fit beside
 * the date and the status. An export passes none: the point of it is
 * every answer.
 */
export function submissionColumns(
  rows: readonly { readonly labels: FormLabelSnapshot }[],
  limit?: number,
): readonly SubmissionColumn[] {
  const columns = new Map<string, string>();
  for (const row of rows) {
    for (const [key, field] of Object.entries(row.labels)) {
      if (!columns.has(key)) columns.set(key, field.label);
    }
  }
  return [...columns].slice(0, limit).map(([key, label]) => ({ key, label }));
}
