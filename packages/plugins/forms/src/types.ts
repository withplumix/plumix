import type { JsonObject, ResolvedEntity } from "plumix";

/**
 * A submission's place in the inbox. `new` on arrival; `spam` is a status
 * rather than a discard so a false positive stays recoverable.
 */
export const SUBMISSION_STATUSES = ["new", "read", "archived", "spam"] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** The `ResolvedEntity` arms that name a row; an archive names none. */
export const BOUND_TYPES = [
  "entry",
  "term",
  "author",
] as const satisfies readonly ResolvedEntity["kind"][];

export type BoundType = (typeof BOUND_TYPES)[number];

/** What a submission was bound to. Two columns in the table and one
 *  value everywhere above it. */
export interface FormBound {
  readonly type: BoundType;
  readonly id: number;
}

export interface FieldLabelSnapshot {
  readonly label: string;
  readonly options?: Readonly<Record<string, string>>;
  /** A composite field's own fields — a repeater's row, a group's members. */
  readonly fields?: FormLabelSnapshot;
}

export type FormLabelSnapshot = Readonly<Record<string, FieldLabelSnapshot>>;

/** The answers as given: one property per field the form declared. */
export type FormAnswers = JsonObject;

export interface FormFieldError {
  readonly field: string;
  readonly message: string;
}

export interface FormSubmissionCandidate {
  readonly form: string;
  readonly answers: FormAnswers;
  readonly labels: FormLabelSnapshot;
  readonly status: SubmissionStatus;
  /** What the form bound, verified off its signed token. */
  readonly bound: FormBound | null;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
}

export type FormSubmitResponse =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly errors: readonly FormFieldError[] };

export interface SubmissionDTO {
  readonly id: number;
  readonly form: string;
  readonly status: SubmissionStatus;
  readonly answers: FormAnswers;
  /** The snapshot the row points at, never the live form's. */
  readonly labels: FormLabelSnapshot;
  /** What the form was bound to, or `null` for one that bound nothing. */
  readonly bound: FormBound | null;
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
   * Counted within the status filter only, from rows, so deleted forms
   * still appear.
   */
  readonly forms: Readonly<Record<string, number>>;
}
