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
  /** A composite field's own fields — a repeater's row, a group's members. */
  readonly fields?: FormLabelSnapshot;
}

export type FormLabelSnapshot = Readonly<Record<string, FieldLabelSnapshot>>;

/** The answers as given: one property per field the form declared. */
export type FormAnswers = JsonObject;

/**
 * One validation failure, named against the field that produced it. The
 * island renders it inline beside that control and lists it in the error
 * summary; the no-JavaScript path renders the same pair server-side.
 */
export interface FormFieldError {
  readonly field: string;
  readonly message: string;
}

/**
 * A submission every check has accepted, as the pre-persist filter and
 * the post-submit action see it. `form` is the slug — the row carries no
 * foreign key to a form, because a form is a value in the repository.
 */
export interface FormSubmissionCandidate {
  readonly form: string;
  readonly answers: FormAnswers;
  readonly labels: FormLabelSnapshot;
  readonly status: SubmissionStatus;
  /** The entry the form bound, verified off its signed token. */
  readonly entryId: number | null;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
}

/**
 * What the submit endpoint answers a caller that asked for JSON. Success
 * carries the confirmation to show in place of the form; failure carries
 * every field that failed, in the order the form declares them.
 */
export type FormSubmitResponse =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly errors: readonly FormFieldError[] };
