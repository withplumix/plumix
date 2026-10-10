import type { StoredSubmission } from "../db/schema.js";
import type { FormFieldError, FormSubmissionCandidate } from "../types.js";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Runs after every other check passes. Starts empty; a filter with
     * nothing to add returns what it was given.
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
