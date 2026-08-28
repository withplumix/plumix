import type { JsonObject } from "plumix";

/**
 * A submission's place in the inbox. `new` on arrival; `spam` is a status
 * rather than a discard so a false positive stays recoverable.
 */
export const SUBMISSION_STATUSES = ["new", "read", "archived", "spam"] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * What one field was called when the answer was given, and what its
 * options were called. Stored on the row so a submission still reads
 * correctly after the form is edited or deleted — without it a renamed
 * field renders as a raw key and a dropdown answer as its stored value.
 */
export interface FieldLabelSnapshot {
  readonly label: string;
  readonly options?: Readonly<Record<string, string>>;
}

export type FormLabelSnapshot = Readonly<Record<string, FieldLabelSnapshot>>;

/** The answers as given: one property per field the form declared. */
export type FormAnswers = JsonObject;
