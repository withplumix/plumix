// No `"use client"`: the SSR pass replaces every export of such a module
// with an island shim, which would break these hooks.
import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { useCallback, useMemo, useState } from "react";
import { documentBasePath, useSingleFlight } from "plumix/blocks/renderer";

import type { FormAnswersOf, FormDefinition, FormWire } from "./define-form.js";
import type { FormFieldError } from "./types.js";
import { SUBMIT_PATH, TOKEN_PATH } from "./contract.js";
import {
  postSubmission,
  submissionBody,
  unreachable,
  useTimingToken,
  withoutNulls,
} from "./wire.js";

export type { FormWire } from "./define-form.js";
export type { FormFieldError } from "./types.js";

/** An omitted field falls back to its declared default. */
export type FormSubmitAnswers<F extends FormDefinition = FormDefinition> =
  LooseAnswers<FormAnswersOf<F>>;

type LooseAnswers<A> = {
  readonly [K in keyof A as undefined extends A[K] ? never : K]: A[K];
} & {
  readonly [K in keyof A as undefined extends A[K] ? K : never]?: A[K];
};

export interface PlumixFormState<F extends FormDefinition = FormDefinition> {
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  /**
   * Nested fields are named as they post (`attendees[0][who]`); an error
   * with no field is about the whole submission.
   */
  readonly errors: readonly FormFieldError[];
  /** True from the moment a submit leaves until its answer lands. */
  readonly submitting: boolean;
  /** What to show in place of the form, once one was accepted. */
  readonly confirmation: string | null;
  /**
   * One field's refusal, for rendering beside its control. Pass `""` for
   * the error that names no field — the one a submission that never
   * reached the endpoint produces.
   */
  errorFor(field: string): string | undefined;
  /**
   * Posts the same body the rendered form would, to the same endpoint. An
   * omitted field falls back to its declared default.
   */
  submit(answers: FormSubmitAnswers<F>): Promise<void>;
}

/**
 * Import the type argument with `import type` so no server callback
 * reaches the bundle. Only the timing token, not the honeypot, applies.
 */
export function usePlumixForm<F extends FormDefinition = FormDefinition>(
  form: FormWire,
): PlumixFormState<F> {
  const wire = useMemo(() => withoutNulls(form), [form]);
  const [errors, setErrors] = useState<readonly FormFieldError[]>([]);
  const token = useTimingToken(`${documentBasePath()}${TOKEN_PATH}`);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Guarded, not left to `submitting`: a second press in the same tick
  // beats the re-render and would store two rows.
  const send = useSingleFlight(
    async (answers: FormSubmitAnswers<F>): Promise<void> => {
      setSubmitting(true);
      try {
        const reply = await postSubmission(
          `${documentBasePath()}${SUBMIT_PATH}`,
          submissionBody(wire, answers, token),
        );
        if (reply === "unreachable") {
          setErrors(unreachable);
          return;
        }
        if (reply.ok) {
          setErrors([]);
          setConfirmation(reply.message);
          return;
        }
        setErrors(reply.errors);
      } finally {
        setSubmitting(false);
      }
    },
  );
  const submit = useCallback(
    async (answers: FormSubmitAnswers<F>): Promise<void> => {
      await send(answers);
    },
    [send],
  );

  const errorFor = useCallback(
    (field: string): string | undefined =>
      errors.find((error) => error.field === field)?.message,
    [errors],
  );

  return {
    fields: wire.fields,
    errors,
    submitting,
    confirmation,
    errorFor,
    submit,
  };
}
