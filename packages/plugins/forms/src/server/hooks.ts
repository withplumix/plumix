import type { StoredSubmission } from "../db/schema.js";
import type { FormFieldError, FormSubmissionCandidate } from "../types.js";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * The last word before a submission is written. It sees one that
     * every field rule, the form's own `validate` and the spam floor
     * have already accepted, and the errors it returns reject it the
     * same way a field rule's do — which is what lets a spam or
     * compliance plugin refuse a submission without per-form wiring.
     *
     * The pipeline starts empty and each filter returns the list as it
     * would have it, so a filter that has nothing to say returns what it
     * was given.
     */
    "form:validate": (
      errors: readonly FormFieldError[],
      candidate: FormSubmissionCandidate,
    ) => readonly FormFieldError[] | Promise<readonly FormFieldError[]>;
  }
  interface ActionRegistry {
    /**
     * One accepted submission, after it was stored and after the form's
     * own `onSubmit` ran. The row is `null` only for a form that opted
     * out of storage.
     */
    "form:submitted": (
      submission: StoredSubmission | null,
      candidate: FormSubmissionCandidate,
    ) => void | Promise<void>;
  }
}
