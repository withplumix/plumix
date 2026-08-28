import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { Label } from "plumix/i18n";
import type { ComponentProps, CSSProperties, ReactNode, Ref } from "react";
import { labelSourceText } from "plumix/i18n";

import type { SubmittedValues } from "../answers.js";
import type { FormDefinition } from "../define-form.js";
import type { FormFieldError } from "../types.js";
import { defaultAnswers, visibleFields } from "../answers.js";
import {
  FORM_SLUG_FIELD,
  HONEYPOT_FIELD,
  RETURN_FIELD,
  TOKEN_FIELD,
} from "../contract.js";
import { SUBMIT_LABEL, SUMMARY_TITLE } from "../messages.js";
import { FormControl } from "./form-control.js";

const optionalText = (label: Label | undefined): string | undefined =>
  label === undefined ? undefined : labelSourceText(label);

// The one piece of styling the plugin cannot leave to the theme: a trap
// the visitor can see is a trap they fill in. Inline rather than in a
// stylesheet so hiding it never depends on a file the page didn't load.
// `aria-hidden` on the wrapper is the other half — this is the `.sr-only`
// recipe, which keeps content in the accessibility tree by design, and a
// screen-reader user who filled the trap would be silently filed as spam.
const HONEYPOT_STYLE: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

function FormField({
  field,
  idBase,
  error,
  answer,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly idBase: string;
  readonly error: string | undefined;
  readonly answer: unknown;
}): ReactNode {
  const id = `${idBase}-${field.key}`;
  const help = optionalText(field.description);
  const helpId = help === undefined ? undefined : `${id}-help`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [helpId, errorId].filter((part) => part !== undefined);
  return (
    <div className="plumix-form-field" data-plumix-form-field={field.key}>
      <label
        className="plumix-form-label"
        data-plumix-form-label=""
        htmlFor={id}
      >
        {labelSourceText(field.label)}
        {field.required === true ? (
          // The visual half of "required". The control's `required`
          // attribute is the half assistive technology reads, so the
          // marker is hidden from it rather than announced twice — and
          // being a glyph rather than a tint, it survives a visitor who
          // cannot tell the label's colour from any other.
          <span
            className="plumix-form-required"
            data-plumix-form-required=""
            aria-hidden="true"
          >
            {" *"}
          </span>
        ) : null}
      </label>
      {helpId === undefined ? null : (
        <p className="plumix-form-help" data-plumix-form-help="" id={helpId}>
          {help}
        </p>
      )}
      {errorId === undefined ? null : (
        <p
          className="plumix-form-error"
          data-plumix-form-error={field.key}
          id={errorId}
        >
          {error}
        </p>
      )}
      <FormControl
        field={field}
        id={id}
        answer={answer}
        describedBy={describedBy.length > 0 ? describedBy.join(" ") : undefined}
        invalid={error !== undefined}
      />
    </div>
  );
}

/**
 * What went wrong, once, at the top of the form. `role="alert"` is what
 * announces it to a screen reader the moment the island renders it;
 * `tabIndex={-1}` is what lets the island move focus here, so a visitor
 * who cannot see the page is told what happened rather than left at a
 * submit button that appeared to do nothing. Each message links to the
 * control that produced it.
 */
function ErrorSummary({
  errors,
  idBase,
  ref,
}: {
  readonly errors: readonly FormFieldError[];
  readonly idBase: string;
  readonly ref?: Ref<HTMLDivElement>;
}): ReactNode {
  return (
    <div
      className="plumix-form-summary"
      data-plumix-form-summary=""
      role="alert"
      tabIndex={-1}
      ref={ref}
    >
      <h2 className="plumix-form-summary-title">
        {labelSourceText(SUMMARY_TITLE)}
      </h2>
      <ul className="plumix-form-summary-list">
        {errors.map((error) => (
          <li key={error.field}>
            {/* An error naming no field — the network refusing the
                submission outright — has no control to send anyone to,
                so it reads as text rather than a link to nowhere. */}
            {error.field === "" ? (
              error.message
            ) : (
              <a href={`#${idBase}-${error.field}`}>{error.message}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface FormMarkupProps {
  readonly form: FormDefinition;
  readonly action: string;
  readonly idBase: string;
  /** Rendered inline against their fields and listed in the summary. */
  readonly errors?: readonly FormFieldError[];
  /**
   * What the visitor already answered — so a rejected submit costs them
   * nothing, and so the conditions are judged against what they said
   * rather than against the defaults the blank form was built from.
   */
  readonly answers?: SubmittedValues;
  /** Client-side only — see `issueTimingToken`. */
  readonly token?: string | null;
  /** Where a submit should return to — see {@link RETURN_FIELD}. */
  readonly returnTo?: string;
  /**
   * True once the island is driving this form: it marks the markup as
   * enhanced, and turns the browser's own validation off so a visitor
   * meets one set of messages rather than the browser's bubbles on one
   * field and the server's on the next.
   */
  readonly enhanced?: boolean;
  readonly busy?: boolean;
  readonly onSubmit?: ComponentProps<"form">["onSubmit"];
  readonly summaryRef?: Ref<HTMLDivElement>;
}

/**
 * The form itself. One implementation renders it three times over: the
 * static server render the block emits, the island that takes that render
 * over, and the page the no-JavaScript path answers a rejected submit
 * with — so what a visitor meets is the same markup however they got it.
 * With no `token`, `errors` or `answers` it is byte-identical for every
 * visitor, which is what keeps the page carrying it edge-cacheable.
 *
 * A field whose condition fails is not rendered at all. The submit
 * handler makes the same call against the answers that come back, and an
 * answer the body does not carry falls back to the same default judged
 * here — so an untouched form is read exactly as it was served.
 *
 * Labels flatten to their source message rather than the visitor's
 * locale: a plugin has no catalog at render time, and a plain string
 * label (the common case) passes through untouched.
 */
export function FormMarkup({
  form,
  action,
  idBase,
  errors = [],
  answers,
  token,
  returnTo,
  enhanced,
  busy,
  onSubmit,
  summaryRef,
}: FormMarkupProps): ReactNode {
  const honeypotId = `${idBase}-${HONEYPOT_FIELD}`;
  const title = optionalText(form.title);
  const values = answers ?? defaultAnswers(form.fields);
  const fields = visibleFields(form.fields, values);
  const messages = new Map(errors.map((error) => [error.field, error.message]));
  return (
    <form
      className="plumix-form"
      data-plumix-form={form.slug}
      method="post"
      action={action}
      data-plumix-form-enhanced={enhanced === true ? "" : undefined}
      noValidate={enhanced === true}
      onSubmit={onSubmit}
    >
      {title === undefined ? null : (
        <h2 className="plumix-form-title" data-plumix-form-title="">
          {title}
        </h2>
      )}
      {errors.length > 0 ? (
        <ErrorSummary errors={errors} idBase={idBase} ref={summaryRef} />
      ) : null}
      <input type="hidden" name={FORM_SLUG_FIELD} value={form.slug} readOnly />
      {typeof token === "string" ? (
        <input type="hidden" name={TOKEN_FIELD} value={token} readOnly />
      ) : null}
      {returnTo === undefined ? null : (
        <input type="hidden" name={RETURN_FIELD} value={returnTo} readOnly />
      )}
      {fields.map((field) => (
        <FormField
          key={field.key}
          field={field}
          idBase={idBase}
          error={messages.get(field.key)}
          answer={answers?.[field.key]}
        />
      ))}
      <div
        className="plumix-form-honeypot"
        data-plumix-form-honeypot=""
        style={HONEYPOT_STYLE}
        aria-hidden="true"
      >
        <input
          id={honeypotId}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="plumix-form-actions" data-plumix-form-actions="">
        <button
          className="plumix-form-submit"
          data-plumix-form-submit=""
          type="submit"
          disabled={busy}
        >
          {labelSourceText(form.submitLabel ?? SUBMIT_LABEL)}
        </button>
      </div>
    </form>
  );
}
