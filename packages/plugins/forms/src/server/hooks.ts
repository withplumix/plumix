import type { StoredSubmission } from "../db/schema.js";
import type { FormSubmissionCandidate } from "../types.js";

declare module "plumix" {
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
