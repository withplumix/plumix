import type { FormLabelSnapshot } from "./types.js";

/** One column of answers, named by the question that produced them. */
export interface SubmissionColumn {
  readonly key: string;
  readonly label: string;
}

/**
 * Read from each row's label snapshot, not the live form, so old
 * generations and deleted forms still name their columns.
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
