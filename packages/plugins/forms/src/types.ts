import type { JsonObject } from "plumix";

/**
 * A submission's place in the inbox. `new` on arrival; `spam` is a status
 * rather than a discard so a false positive stays recoverable.
 */
export const SUBMISSION_STATUSES = ["new", "read", "archived", "spam"] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * What one field was called when the answer was given, and what its
 * options were called. Kept beside the answers so a submission still
 * reads correctly after the form is edited or deleted — without it a
 * renamed field renders as a raw key and a dropdown answer as its stored
 * value.
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

/**
 * One submission as the inbox reads it — the stored row with its date as
 * an ISO string. Declared here rather than beside the router that
 * returns it: the package entry exports it, and the entry may not reach
 * `rpc.ts` (see {@link SUBMISSION_MODERATE_CAPABILITY}).
 */
export interface SubmissionDTO {
  readonly id: number;
  readonly form: string;
  readonly status: SubmissionStatus;
  readonly answers: FormAnswers;
  /** The snapshot the row points at, never the live form's. */
  readonly labels: FormLabelSnapshot;
  readonly entryId: number | null;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly handlerError: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface SubmissionsPage {
  readonly submissions: readonly SubmissionDTO[];
  /** Pass back as `cursor` for the next page; null at the end of the list. */
  readonly nextCursor: string | null;
}

/** A form the inbox can filter by, read from the registry at request time. */
export interface FormSummary {
  readonly slug: string;
  readonly title: string;
}

/** Which submissions a read is looking at. Every facet is optional. */
export interface SubmissionFilter {
  readonly form?: string;
  readonly status?: SubmissionStatus;
  /** Inclusive lower bound on arrival; omit for no floor. */
  readonly since?: Date;
  /** Inclusive upper bound on arrival; omit for no ceiling. */
  readonly until?: Date;
}

export interface SubmissionCounts {
  /** Every status, counted within the form filter but not the status one. */
  readonly statuses: Readonly<Record<SubmissionStatus, number>>;
  /**
   * Each slug that has submissions, counted within the status filter but
   * not the form one. Read off the rows rather than the registry, so a
   * form nobody declares any more still appears with its backlog.
   */
  readonly forms: Readonly<Record<string, number>>;
}
