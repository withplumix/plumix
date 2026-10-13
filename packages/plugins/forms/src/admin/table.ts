import type { MessageDescriptor } from "plumix/i18n";

import type {
  FormBound,
  FormSummary,
  SubmissionDTO,
  SubmissionFilter,
} from "../types.js";

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

/**
 * A form may be called `constructor`; a bare index would return an
 * inherited function, which React throws on.
 */
export function countFor(
  counts: Readonly<Record<string, number>> | undefined,
  key: string,
): number {
  return counts && Object.hasOwn(counts, key) ? (counts[key] ?? 0) : 0;
}

/** The kind as well as the id: "42" alone does not say what it names. */
export function boundLabel(bound: FormBound | null): MessageDescriptor | null {
  if (bound === null) return null;
  return {
    id: "plugin.forms.inbox.detail.boundValue",
    message: "{type, select, term {Term} author {Author} other {Entry}} #{id}",
    values: { type: bound.type, id: bound.id },
  };
}

/** What the inbox asks `list` for; the first page carries no cursor. */
export function submissionsPageInput(
  filter: SubmissionFilter,
  cursor: string | undefined,
): SubmissionFilter & { readonly cursor?: string } {
  return cursor === undefined ? filter : { ...filter, cursor };
}

/** Which of its four states the submissions table shows. */
export type InboxViewState = "loading" | "error" | "empty" | "rows";

export function inboxViewState(
  list: { readonly isLoading: boolean; readonly error: unknown },
  rows: readonly unknown[],
): InboxViewState {
  if (list.isLoading) return "loading";
  if (list.error instanceof Error) return "error";
  return rows.length === 0 ? "empty" : "rows";
}

/** Which of its three states the detail panel shows. */
export type DetailViewState =
  | { readonly kind: "loading" }
  | { readonly kind: "gone" }
  | { readonly kind: "ready"; readonly row: SubmissionDTO };

export function detailViewState(submission: {
  readonly isLoading: boolean;
  readonly data: SubmissionDTO | undefined;
}): DetailViewState {
  if (submission.isLoading) return { kind: "loading" };
  return submission.data
    ? { kind: "ready", row: submission.data }
    : { kind: "gone" };
}
