// Deliberately no `"use client"` directive. The directive marks an
// *island* — a component the build gives its own chunk and a server-side
// shim that renders a `<plumix-island>` in its place — and every export of
// a module carrying one is replaced by that shim during the SSR pass. A
// hook shimmed into a component returns a React element, so the theme
// island calling it would render nothing it asked for. The directive
// belongs on the theme's own component, which imports this and is the
// thing that hydrates.
import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { useCallback, useMemo, useRef, useState } from "react";
import * as v from "valibot";

import type { FormAnswersOf, FormDefinition, FormWire } from "./define-form.js";
import type { FormFieldError } from "./types.js";
import { writeSubmittedValues } from "./answers.js";
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  FORM_SLUG_FIELD,
  SUBMIT_PATH,
  TOKEN_FIELD,
  TOKEN_PATH,
} from "./contract.js";
import {
  documentBasePath,
  SubmitResponse,
  unreachable,
  useTimingToken,
  withoutNulls,
} from "./wire.js";

export type { FormWire } from "./define-form.js";
export type { FormFieldError } from "./types.js";

/**
 * The answers {@link PlumixFormState.submit} takes: one property per
 * field, insisted on only where the field insists. A form's answers type
 * describes a stored *row*, where every key the form declares is present
 * and an unanswered one reads `undefined`; a caller writes the answers
 * they have and leaves the rest to each field's declared default, which
 * is what a visitor served the blank form and leaving that control alone
 * would have posted.
 */
export type FormSubmitAnswers<F extends FormDefinition = FormDefinition> =
  LooseAnswers<FormAnswersOf<F>>;

type LooseAnswers<A> = {
  readonly [K in keyof A as undefined extends A[K] ? never : K]: A[K];
} & {
  readonly [K in keyof A as undefined extends A[K] ? K : never]?: A[K];
};

/**
 * What a theme rendering its own controls gets back. Everything a form
 * needs and nothing about how it looks: no markup, no stylesheet, no
 * class names — the developer's own React is the whole of the form.
 */
export interface PlumixFormState<F extends FormDefinition = FormDefinition> {
  /**
   * The form's questions, in the order it declares them, each carrying
   * its label, its help text, its options and whether it is required —
   * enough to render a control per field, or to read one field's label
   * off and hand-write the rest.
   */
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  /**
   * Every refusal the last submit came back with, in the order the form
   * asks its questions. A field inside a group or a repeater row is named
   * as it posts (`attendees[0][who]`); an error naming no field at all is
   * one about the submission rather than an answer.
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
   * Send the answers. They are written out as the body the plugin's own
   * markup would have posted and go to the same endpoint, so a form
   * submitted from a theme's own controls is validated, met by the spam
   * floor and stored exactly as one submitted from the rendered form.
   *
   * A field the answers say nothing about falls back to its declared
   * default, which is what a visitor served the blank form and leaving
   * that control alone would have posted.
   */
  submit(answers: FormSubmitAnswers<F>): Promise<void>;
}

/**
 * A form, without the plugin's rendering of it.
 *
 *     const form = usePlumixForm<typeof subscribe>(props.form);
 *
 * The argument is the form's shape as `formWire` from
 * `@plumix/plugin-forms/theme` hands it to a `"use client"` island. The
 * type argument is the form itself, imported with `import type` so no
 * server-only callback is dragged into the browser bundle — it is what
 * makes `submit` take that form's answers rather than any object.
 *
 * The spam floor still applies. The honeypot is a field in markup this
 * hook does not render, so what survives here is the timing token, which
 * it fetches on mount exactly as the plugin's own island does.
 */
export function usePlumixForm<F extends FormDefinition = FormDefinition>(
  form: FormWire,
): PlumixFormState<F> {
  const wire = useMemo(() => withoutNulls(form), [form]);
  const [errors, setErrors] = useState<readonly FormFieldError[]>([]);
  const token = useTimingToken(`${documentBasePath()}${TOKEN_PATH}`);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // A ref rather than the `submitting` state: a second press landing in
  // the same tick reads the state the first press has not re-rendered
  // yet, and the cost of letting it through is two rows for one enquiry.
  // A theme is handed `submitting` to disable its own control with;
  // nothing makes it, so the guard is the hook's.
  const inFlight = useRef(false);

  const submit = useCallback(
    async (answers: FormSubmitAnswers<F>): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      const body = writeSubmittedValues(wire.fields, answers);
      body.set(FORM_SLUG_FIELD, wire.slug);
      if (token !== null) body.set(TOKEN_FIELD, token);
      setSubmitting(true);
      try {
        const response = await fetch(`${documentBasePath()}${SUBMIT_PATH}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            // The header a plain form cannot set. Sending it puts this
            // submission through the ordinary CSRF gate rather than the
            // `formPost` exemption the no-JavaScript path takes.
            [CSRF_HEADER]: CSRF_HEADER_VALUE,
          },
          // A `URLSearchParams` body is sent urlencoded, exactly as the
          // plain form posts it, and sets its own content type.
          body,
        });
        const payload = v.safeParse(SubmitResponse, await response.json());
        if (!payload.success) {
          setErrors(unreachable);
          return;
        }
        if (payload.output.ok) {
          setErrors([]);
          setConfirmation(payload.output.message);
          return;
        }
        setErrors(payload.output.errors);
      } catch {
        setErrors(unreachable);
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [wire, token],
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
