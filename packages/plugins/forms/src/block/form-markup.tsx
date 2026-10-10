import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { Label } from "plumix/i18n";
import type { ComponentProps, ReactNode, Ref } from "react";
import { useEffect, useRef } from "react";
import { VISUALLY_HIDDEN_STYLE } from "plumix/blocks/renderer";
import { labelSourceText } from "plumix/i18n";

import type { SubmittedValue, SubmittedValues } from "../answers.js";
import type { FormWire } from "../define-form.js";
import type { FormStep } from "../steps.js";
import type { FormFieldError } from "../types.js";
import {
  asGroup,
  asRows,
  defaultAnswers,
  maxRows,
  minRows,
  visibleFields,
} from "../answers.js";
import {
  BOUND_FIELD,
  FORM_SLUG_FIELD,
  HONEYPOT_FIELD,
  RETURN_FIELD,
  TOKEN_FIELD,
  TURNSTILE_FIELD,
} from "../contract.js";
import {
  ADD_ROW,
  BACK_LABEL,
  CAPTCHA_NEEDS_JS,
  NEXT_LABEL,
  REMOVE_ROW,
  removeRowLabel,
  rowLegend,
  stepPositionMessage,
  SUBMIT_LABEL,
  SUMMARY_TITLE,
} from "../messages.js";
import { elementId, fieldName, rowMarkerName, rowName } from "../paths.js";
import { visibleSteps } from "../steps.js";
import { FormControl } from "./form-control.js";

const optionalText = (label: Label | undefined): string | undefined =>
  label === undefined ? undefined : labelSourceText(label);

/**
 * Stable ids, not a count, so removing a middle row takes its own
 * answers with it.
 */
export type FormRowState = Readonly<Record<string, readonly string[]>>;

type FormRowsChange = (statePath: string, ids: readonly string[]) => void;

interface FormChrome {
  readonly idBase: string;
  readonly messages: ReadonlyMap<string, string>;
  readonly rows: FormRowState | undefined;
  readonly onRowsChange: FormRowsChange | undefined;
}

const serverRowIds = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => String(index));

// A removed row's id must never be reused, or it takes a mounted row's
// controls.
const withNewRow = (ids: readonly string[]): readonly string[] => [
  ...ids,
  String(ids.reduce((highest, id) => Math.max(highest, Number(id)), -1) + 1),
];

const statePathOf = (parent: string | undefined, key: string): string =>
  parent === undefined ? key : `${parent}.${key}`;

// Hidden from assistive technology, which reads `required` already. A
// glyph, not a tint, for colour-blind visitors.
function RequiredMark({
  field,
}: {
  readonly field: MetaBoxFieldManifestEntry;
}): ReactNode {
  if (field.required !== true) return null;
  return (
    <span
      className="plumix-form-required"
      data-plumix-form-required=""
      aria-hidden="true"
    >
      {" *"}
    </span>
  );
}

function FieldError({
  name,
  id,
  message,
}: {
  readonly name: string;
  readonly id: string;
  readonly message: string;
}): ReactNode {
  return (
    <p className="plumix-form-error" data-plumix-form-error={name} id={id}>
      {message}
    </p>
  );
}

function describe(
  field: MetaBoxFieldManifestEntry,
  name: string,
  chrome: FormChrome,
): {
  readonly id: string;
  readonly error: string | undefined;
  readonly describedBy: string | undefined;
  readonly nodes: ReactNode;
} {
  const id = elementId(chrome.idBase, name);
  const error = chrome.messages.get(name);
  const help = optionalText(field.description);
  const helpId = help === undefined ? undefined : `${id}-help`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const parts = [helpId, errorId].filter((part) => part !== undefined);
  return {
    id,
    error,
    describedBy: parts.length > 0 ? parts.join(" ") : undefined,
    nodes: (
      <>
        {helpId === undefined ? null : (
          <p className="plumix-form-help" data-plumix-form-help="" id={helpId}>
            {help}
          </p>
        )}
        {errorId === undefined || error === undefined ? null : (
          <FieldError name={name} id={errorId} message={error} />
        )}
      </>
    ),
  };
}

function FormField({
  field,
  name,
  answer,
  optional,
  chrome,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly name: string;
  readonly answer: SubmittedValue;
  readonly optional: boolean;
  readonly chrome: FormChrome;
}): ReactNode {
  const { id, error, describedBy, nodes } = describe(field, name, chrome);
  return (
    <div className="plumix-form-field" data-plumix-form-field={name}>
      <label
        className="plumix-form-label"
        data-plumix-form-label=""
        htmlFor={id}
      >
        {labelSourceText(field.label)}
        <RequiredMark field={field} />
      </label>
      {nodes}
      <FormControl
        field={field}
        name={name}
        id={id}
        answer={answer}
        describedBy={describedBy}
        invalid={error !== undefined}
        optional={optional}
      />
    </div>
  );
}

function FormFieldset({
  field,
  name,
  kind,
  chrome,
  children,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly name: string;
  readonly kind: "group" | "repeater";
  readonly chrome: FormChrome;
  readonly children: ReactNode;
}): ReactNode {
  const { id, error, describedBy, nodes } = describe(field, name, chrome);
  return (
    <fieldset
      className={`plumix-form-${kind}`}
      {...{ [`data-plumix-form-${kind}`]: name }}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={error === undefined ? undefined : ("true" as const)}
    >
      <legend className="plumix-form-legend" data-plumix-form-legend="">
        {labelSourceText(field.label)}
        <RequiredMark field={field} />
      </legend>
      {nodes}
      {children}
    </fieldset>
  );
}

// Each row's hidden marker is how the handler counts rows. Add and remove
// need the island: the endpoint answers submissions, not row requests.
function FormRepeater({
  field,
  value,
  name,
  statePath,
  optional,
  chrome,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly value: SubmittedValue;
  readonly name: string;
  readonly statePath: string;
  readonly optional: boolean;
  readonly chrome: FormChrome;
}): ReactNode {
  const subFields = field.subFields ?? [];
  const rows = asRows(value);
  const ids = chrome.rows?.[statePath] ?? serverRowIds(rows.length);
  const label = labelSourceText(field.label);
  const change = chrome.onRowsChange;
  const floor = Math.max(minRows(field), 1);
  const addId = `${elementId(chrome.idBase, name)}-add`;
  // The remove button unmounts itself; focus moves to the add button,
  // which removal always leaves available.
  const removed = useRef(false);
  useEffect(() => {
    if (!removed.current) return;
    removed.current = false;
    document.getElementById(addId)?.focus();
  });
  return (
    <FormFieldset field={field} name={name} kind="repeater" chrome={chrome}>
      {ids.map((id, index) => {
        const rowPath = rowName(name, index);
        return (
          <fieldset
            key={id}
            className="plumix-form-row"
            data-plumix-form-row={rowPath}
          >
            <legend className="plumix-form-legend" data-plumix-form-legend="">
              {rowLegend(label, index)}
            </legend>
            <input type="hidden" name={rowMarkerName(name)} value="" readOnly />
            <FormFields
              fields={subFields}
              // An empty bag would hide a sub-field whose driver's default
              // makes it visible, yet the server would require it.
              values={rows[index] ?? defaultAnswers(subFields)}
              name={rowPath}
              statePath={statePathOf(statePath, id)}
              optional={optional || index >= minRows(field)}
              chrome={chrome}
            />
            {change === undefined || ids.length <= floor ? null : (
              <button
                className="plumix-form-row-remove"
                data-plumix-form-row-remove={rowPath}
                type="button"
                aria-label={removeRowLabel(label, index)}
                onClick={() => {
                  removed.current = true;
                  change(
                    statePath,
                    ids.filter((candidate) => candidate !== id),
                  );
                }}
              >
                {labelSourceText(REMOVE_ROW)}
              </button>
            )}
          </fieldset>
        );
      })}
      {change === undefined || ids.length >= maxRows(field) ? null : (
        <button
          className="plumix-form-row-add"
          data-plumix-form-row-add={name}
          id={addId}
          type="button"
          onClick={() => {
            change(statePath, withNewRow(ids));
          }}
        >
          {labelSourceText(field.addLabel ?? ADD_ROW)}
        </button>
      )}
    </FormFieldset>
  );
}

// Groups and rows recurse with their own values, matching the submit
// handler's scoping.
function FormFields({
  fields,
  values,
  name,
  statePath,
  optional = false,
  chrome,
}: {
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  readonly values: SubmittedValues;
  readonly name: string | undefined;
  readonly statePath: string | undefined;
  readonly optional?: boolean;
  readonly chrome: FormChrome;
}): ReactNode {
  return visibleFields(fields, values).map((field) => {
    const fieldPath = fieldName(name, field.key);
    const value = values[field.key];
    if (field.inputType === "group") {
      return (
        <FormFieldset
          key={field.key}
          field={field}
          name={fieldPath}
          kind="group"
          chrome={chrome}
        >
          <FormFields
            fields={field.subFields ?? []}
            values={asGroup(value)}
            name={fieldPath}
            statePath={statePathOf(statePath, field.key)}
            optional={optional}
            chrome={chrome}
          />
        </FormFieldset>
      );
    }
    if (field.inputType === "repeater") {
      return (
        <FormRepeater
          key={field.key}
          field={field}
          value={value}
          name={fieldPath}
          statePath={statePathOf(statePath, field.key)}
          optional={optional}
          chrome={chrome}
        />
      );
    }
    return (
      <FormField
        key={field.key}
        field={field}
        name={fieldPath}
        answer={value}
        optional={optional}
        chrome={chrome}
      />
    );
  });
}

// Only on the submitting step: a token solved two steps early may expire
// before it is posted.
function FormCaptcha({
  siteKey,
  idBase,
  error,
  ref,
}: {
  readonly siteKey: string;
  readonly idBase: string;
  readonly error: string | undefined;
  readonly ref?: Ref<HTMLDivElement>;
}): ReactNode {
  const id = elementId(idBase, TURNSTILE_FIELD);
  const errorId = error === undefined ? undefined : `${id}-error`;
  return (
    <div
      className="plumix-form-captcha"
      data-plumix-form-captcha={siteKey}
      id={id}
      // The summary links here, and there is no control of its own to
      // land on until the island has drawn one.
      tabIndex={-1}
      aria-describedby={errorId}
    >
      <div ref={ref} />
      <noscript>{labelSourceText(CAPTCHA_NEEDS_JS)}</noscript>
      {errorId === undefined || error === undefined ? null : (
        <FieldError name={TURNSTILE_FIELD} id={errorId} message={error} />
      )}
    </div>
  );
}

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
              <a href={`#${elementId(idBase, error.field)}`}>{error.message}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const stepName = (step: FormStep, index: number, total: number): string =>
  step.title === undefined
    ? stepPositionMessage(index + 1, total)
    : labelSourceText(step.title);

function StepProgress({
  steps,
  index,
}: {
  readonly steps: readonly FormStep[];
  readonly index: number;
}): ReactNode {
  return (
    <ol className="plumix-form-steps" data-plumix-form-steps="">
      {steps.map((step, position) => (
        <li
          key={position}
          className="plumix-form-step-marker"
          data-plumix-form-step-marker={position}
          aria-current={position === index ? "step" : undefined}
        >
          {stepName(step, position, steps.length)}
        </li>
      ))}
    </ol>
  );
}

export interface FormMarkupProps {
  readonly form: FormWire;
  readonly action: string;
  readonly idBase: string;
  /** Rendered inline against their fields and listed in the summary. */
  readonly errors?: readonly FormFieldError[];
  /** Conditions are judged against these rather than the defaults. */
  readonly answers?: SubmittedValues;
  /** Client-side only — see `issueTimingToken`. */
  readonly token?: string | null;
  /** Unlike `token`, safe in the server render: it depends on the page. */
  readonly bound?: string | null;
  /** Where a submit should return to — see {@link RETURN_FIELD}. */
  readonly returnTo?: string;
  /** Also turns browser validation off, so one set of messages shows. */
  readonly enhanced?: boolean;
  readonly busy?: boolean;
  readonly onSubmit?: ComponentProps<"form">["onSubmit"];
  /** Must fold edits back into `answers`, which drive the wizard's shape. */
  readonly onChange?: ComponentProps<"form">["onChange"];
  readonly summaryRef?: Ref<HTMLDivElement>;
  /** Where the island draws the challenge — see `drawCaptcha`. */
  readonly captchaRef?: Ref<HTMLDivElement>;
  /**
   * Absent renders every field as one form, as a no-JavaScript visitor sees it.
   */
  readonly step?: number;
  readonly onBack?: ComponentProps<"button">["onClick"];
  readonly stepHeadingRef?: Ref<HTMLHeadingElement>;
  /** The island's rows — see {@link FormRowState}. */
  readonly rows?: FormRowState;
  /**
   * Supplied only by a live island, and what puts the add and remove
   * buttons on the page: without it there is nothing behind them.
   */
  readonly onRowsChange?: FormRowsChange;
}

/**
 * Without `token`, `errors` or `answers` it is byte-identical for every
 * visitor, so the page stays edge-cacheable. Labels render in the source
 * locale.
 */
export function FormMarkup({
  form,
  action,
  idBase,
  errors = [],
  answers,
  token,
  bound,
  returnTo,
  enhanced,
  busy,
  onSubmit,
  summaryRef,
  captchaRef,
  step,
  onBack,
  stepHeadingRef,
  onChange,
  rows,
  onRowsChange,
}: FormMarkupProps): ReactNode {
  const honeypotId = `${idBase}-${HONEYPOT_FIELD}`;
  const title = optionalText(form.title);
  const values = answers ?? defaultAnswers(form.fields);
  const steps = visibleSteps(form, values);
  // No caller asked for a step: -1, which matches no real one, so every
  // test below reads as "not a wizard".
  const index = step === undefined ? -1 : Math.min(step, steps.length - 1);
  const stepped = index >= 0 && steps.length > 1;
  // The step carrying the submit button — which is every step of a form
  // nobody is paging through, and the last of one they are.
  const submits = !stepped || index === steps.length - 1;
  const shown = stepped ? steps[index] : undefined;
  const fields = shown?.fields ?? steps.flatMap((one) => one.fields);
  const chrome: FormChrome = {
    idBase,
    messages: new Map(errors.map((error) => [error.field, error.message])),
    rows,
    onRowsChange,
  };
  const StepHeading = title === undefined ? "h2" : "h3";
  const controls = (
    <FormFields
      fields={fields}
      values={values}
      name={undefined}
      statePath={undefined}
      chrome={chrome}
    />
  );
  return (
    <form
      className="plumix-form"
      data-plumix-form={form.slug}
      method="post"
      action={action}
      data-plumix-form-enhanced={enhanced === true ? "" : undefined}
      noValidate={enhanced === true}
      onSubmit={onSubmit}
      onChange={onChange}
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
      {typeof bound === "string" ? (
        <input type="hidden" name={BOUND_FIELD} value={bound} readOnly />
      ) : null}
      {returnTo === undefined ? null : (
        <input type="hidden" name={RETURN_FIELD} value={returnTo} readOnly />
      )}
      {stepped ? <StepProgress steps={steps} index={index} /> : null}
      {shown === undefined ? (
        controls
      ) : (
        <div className="plumix-form-step" data-plumix-form-step={index}>
          {/* Focus lands here on step change. Its level depends on the
              form title, so an untitled form doesn't skip a level. */}
          <StepHeading
            className="plumix-form-step-title"
            data-plumix-form-step-title=""
            tabIndex={-1}
            ref={stepHeadingRef}
          >
            {stepName(shown, index, steps.length)}
          </StepHeading>
          {controls}
        </div>
      )}
      {/* `aria-hidden` too, or a screen-reader user who filled the trap
          would be silently filed as spam. */}
      <div
        className="plumix-form-honeypot"
        data-plumix-form-honeypot=""
        // eslint-disable-next-line shadcn/no-inline-styles -- public markup, where no admin stylesheet loads; core keeps this inline so hiding never depends on a theme's CSS
        style={VISUALLY_HIDDEN_STYLE}
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
      {submits && form.turnstile !== undefined ? (
        <FormCaptcha
          siteKey={form.turnstile.siteKey}
          idBase={idBase}
          error={chrome.messages.get(TURNSTILE_FIELD)}
          ref={captchaRef}
        />
      ) : null}
      <div className="plumix-form-actions" data-plumix-form-actions="">
        {index > 0 ? (
          <button
            className="plumix-form-back"
            data-plumix-form-back=""
            type="button"
            disabled={busy}
            onClick={onBack}
          >
            {labelSourceText(BACK_LABEL)}
          </button>
        ) : null}
        {submits ? (
          <button
            className="plumix-form-submit"
            data-plumix-form-submit=""
            type="submit"
            disabled={busy}
          >
            {labelSourceText(form.submitLabel ?? SUBMIT_LABEL)}
          </button>
        ) : (
          // A submit button, so Enter in a field means "next" rather than
          // a browser guess.
          <button
            className="plumix-form-next"
            data-plumix-form-next=""
            type="submit"
            disabled={busy}
          >
            {labelSourceText(NEXT_LABEL)}
          </button>
        )}
      </div>
    </form>
  );
}
