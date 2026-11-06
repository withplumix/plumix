import { defineEvent } from "plumix/plugin";

import type { StoredSubmission } from "../db/schema.js";
import type { FormSubmissionCandidate } from "../types.js";

/** The forms plugin's events, exported as `form`. */
export const form = {
  /**
   * One accepted submission, after it was stored and after the form's own
   * `onSubmit` ran. `submission` is `null` only for a form that opted out of
   * storage.
   */
  submitted: defineEvent<{
    readonly submission: StoredSubmission | null;
    readonly candidate: FormSubmissionCandidate;
  }>("form:submitted"),
};
