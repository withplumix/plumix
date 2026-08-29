import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { Label } from "plumix/i18n";
import type { ComponentProps, CSSProperties, ReactNode, Ref } from "react";
import { useEffect, useRef } from "react";
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
} from "../contract.js";
import {
  ADD_ROW,
  BACK_LABEL,
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

/**
 * Which rows of which repeater are on the page, keyed by the repeater's
 * place in the form and valued by one stable id per row. Ids rather than
 * a count because they are what React keys a row's controls by: removing
 * the row in the middle has to take that row's answers with it and leave
 * its neighbours' where they are, and only a key that survives the
 * renumbering can do that.
 *
 * Absent for a form nobody is driving, where every repeater falls back to
 * the rows the server rendered.
 */
export type FormRowState = Readonly<Record<string, readonly string[]>>;

/** What the island calls when a visitor adds or removes a row. */
type FormRowsChange = (statePath: string, ids: readonly string[]) => void;

/** Everything below one field, invariant across the whole form. */
interface FormChrome {
  readonly idBase: string;
  readonly messages: ReadonlyMap<string, string>;
  readonly rows: FormRowState | undefined;
  readonly onRowsChange: FormRowsChange | undefined;
}

const serverRowIds = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => String(index));

// Ids are numeric strings, so one past the highest is one nothing holds —
// including a row that was removed, whose id must never come back and
// take a still-mounted row's controls with it.
const withNewRow = (ids: readonly string[]): readonly string[] => [
  ...ids,
  String(ids.reduce((highest, id) => Math.max(highest, Number(id)), -1) + 1),
];

const statePathOf = (parent: string | undefined, key: string): string =>
  parent === undefined ? key : `${parent}.${key}`;

/**
 * The visual half of "required". The control's `required` attribute is
 * the half assistive technology reads, so the marker is hidden from it
 * rather than announced twice — and being a glyph rather than a tint, it
 * survives a visitor who cannot tell the label's colour from any other.
 */
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

/**
 * The help text and the error that describe one field, and the ids that
 * wire them to it. Shared by every field shape: a control points at them
 * with `aria-describedby`, and so does the `<fieldset>` a group or a
 * repeater renders, which carries the same implicit grouping role.
 */
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
        {errorId === undefined ? null : (
          <p
            className="plumix-form-error"
            data-plumix-form-error={name}
            id={errorId}
          >
            {error}
          </p>
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

/**
 * The shell a group and a repeater share: a `<fieldset>` naming itself in
 * its `<legend>`, carrying the id the error summary links to and the help
 * and error text that belong to the container rather than to anything
 * inside it — a row count the visitor missed is the repeater's error, not
 * any one row's.
 */
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

/**
 * A repeater: as many rows as the visitor has things to say. Each row is
 * its own `<fieldset>` carrying one hidden marker, and the markers are
 * how the handler counts the rows that came back — a repeater posts no
 * value of its own, so nothing else can claim that name.
 *
 * Add and remove appear only once the island is driving the form. Without
 * JavaScript there is nothing behind them: adding a row means asking the
 * server for one, and the plugin's endpoint answers submissions rather
 * than serving forms. The form is served with the fewest rows it accepts,
 * and never fewer than one.
 */
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
  // The remove button unmounts itself, so without this a keyboard visitor
  // is left on `<body>` with no announcement and nothing to carry on from.
  // Removing always leaves room for another row, so the add button is
  // always there to take the focus.
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
              // A row the island added is past what the server rendered,
              // and it has to be judged by the same defaults its controls
              // are seeded from — an empty bag would hide a sub-field
              // whose driver's default makes it visible, leaving an answer
              // the server then asks for and nothing on the page to give.
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

/**
 * One level of a form's questions, in the order it declares them. A group
 * and a repeater row recurse through here with their own values, so a
 * condition inside one is judged against that scope's answers and nothing
 * else's — which is the same call the submit handler makes over the
 * answers that come back.
 */
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
  /** True in a scope the visitor may leave blank — see `FormControl`. */
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

/**
 * Where the visitor is, and how far there is to go. Rendered only where
 * a wizard is: a form nobody broke into steps has one step, which is a
 * progress indicator with nothing to indicate.
 */
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
  /**
   * What the visitor already answered — so a rejected submit costs them
   * nothing, and so the conditions are judged against what they said
   * rather than against the defaults the blank form was built from.
   */
  readonly answers?: SubmittedValues;
  /** Client-side only — see `issueTimingToken`. */
  readonly token?: string | null;
  /**
   * The signed entry a bound form was rendered on — see `signBoundEntry`.
   * Unlike `token` it belongs in the server render: it is about the page,
   * not the visitor, so it costs the page nothing at the edge.
   */
  readonly bound?: string | null;
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
  /**
   * Every edit, so that what a wizard shows keeps up with what the
   * visitor has said. Which fields a step holds, how many steps there
   * are, and whether the button on this one moves on or submits are all
   * read from `answers` — so an edit nobody folded back into them leaves
   * the form deciding against what the visitor said a keystroke ago.
   */
  readonly onChange?: ComponentProps<"form">["onChange"];
  readonly summaryRef?: Ref<HTMLDivElement>;
  /**
   * Which of the form's steps to show. Absent — the server render, the
   * editor, the page a rejected submit is answered with — renders every
   * field as one form, which is what a visitor with no JavaScript
   * submits. Only the island passes it, and only once it is live.
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
  bound,
  returnTo,
  enhanced,
  busy,
  onSubmit,
  summaryRef,
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
  // A wizard needs both a caller asking for a step and more than one step
  // to move between — so a form the answers collapse to a single step
  // sheds its stepper rather than showing a bar with one mark on it.
  const stepped = index >= 0 && steps.length > 1;
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
          {/* Where focus lands on every step change, so a visitor who
              cannot see the page is told which step they are now on
              rather than left where the button they pressed used to be.
              It sits under the form's own title where there is one, and
              stands in for it where there is not — a fixed level would
              skip from the page's `h1` to an `h3` on an untitled form. */}
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
        {/* "Next" submits too. A step whose only button was a plain one
            would leave the browser to guess what Enter in a text field
            means, and a submit button held back for the last step would
            make that guess "post the half-filled form". */}
        {stepped && index < steps.length - 1 ? (
          <button
            className="plumix-form-next"
            data-plumix-form-next=""
            type="submit"
            disabled={busy}
          >
            {labelSourceText(NEXT_LABEL)}
          </button>
        ) : (
          <button
            className="plumix-form-submit"
            data-plumix-form-submit=""
            type="submit"
            disabled={busy}
          >
            {labelSourceText(form.submitLabel ?? SUBMIT_LABEL)}
          </button>
        )}
      </div>
    </form>
  );
}
