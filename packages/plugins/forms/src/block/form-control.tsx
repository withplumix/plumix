import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { ReactNode } from "react";
import { labelSourceText } from "plumix/i18n";

import { asPosted, TOGGLE_ON } from "../answers.js";

/**
 * Posted alongside a control that stays silent when the visitor chooses
 * nothing — an unticked checkbox, a multiple choice with no selection.
 * Without it the handler cannot tell "chose nothing" from "was never
 * shown this field", and the second falls back to the field's default,
 * which would quietly undo the visitor's answer.
 */
function EmptyAnswer({ name }: { readonly name: string }): ReactNode {
  return <input type="hidden" name={name} value="" readOnly />;
}

/**
 * One field's control, chosen by its input type. Every branch carries the
 * same identity attributes — the `id` its label points at, the `name` the
 * submit handler reads the answer back under — so a form's markup stays
 * one shape however its questions are asked.
 */
export function FormControl({
  field,
  name,
  id,
  answer,
  describedBy,
  invalid,
  optional,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  /** What the answer posts under — the field's key, bracketed by its container. */
  readonly name: string;
  readonly id: string;
  /**
   * What the visitor already answered, when the form is being rendered
   * back to them after a rejected submit. Absent on a form nobody has
   * filled in, where the field's own default seeds the control instead.
   */
  readonly answer?: unknown;
  /** Ids of the help text and error this control is described by. */
  readonly describedBy?: string;
  readonly invalid?: boolean;
  /**
   * True inside a repeater row the form does not insist on. The browser's
   * own `required` is dropped there: the server asks a blank row nothing,
   * so leaving one alone has to be something the browser lets a visitor
   * with no JavaScript actually do.
   */
  readonly optional?: boolean;
}): ReactNode {
  const seed = answer === undefined ? field.default : answer;
  const common = {
    className: "plumix-form-control",
    "data-plumix-form-control": name,
    id,
    name,
    required: optional === true ? undefined : field.required,
    "aria-describedby": describedBy,
    "aria-invalid": invalid === true ? ("true" as const) : undefined,
  };
  const placeholder =
    field.placeholder === undefined
      ? undefined
      : labelSourceText(field.placeholder);

  if (field.inputType === "textarea") {
    return (
      <textarea
        {...common}
        placeholder={placeholder}
        maxLength={field.maxLength}
        defaultValue={asPosted(seed)[0]}
      />
    );
  }

  if (field.inputType === "select") {
    // React reads a single select's default as a scalar and a multiple
    // one's as a list, and warns when handed the other.
    const selected = asPosted(seed);
    return (
      <>
        {field.multiple ? <EmptyAnswer name={name} /> : null}
        <select
          {...common}
          multiple={field.multiple}
          defaultValue={field.multiple ? selected : (selected[0] ?? "")}
        >
          {/* A single-choice field needs a way to say nothing yet; with
              `required` the browser then insists on a real option. */}
          {field.multiple ? null : <option value="" />}
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {labelSourceText(option.label)}
            </option>
          ))}
        </select>
      </>
    );
  }

  if (field.inputType === "toggle") {
    return (
      <>
        <EmptyAnswer name={name} />
        <input
          {...common}
          type="checkbox"
          value={TOGGLE_ON}
          defaultChecked={seed === true}
        />
      </>
    );
  }

  // Every remaining roster type names its own HTML input type — the
  // composite controls have all returned above.
  return (
    <input
      {...common}
      type={field.inputType}
      placeholder={placeholder}
      maxLength={field.maxLength}
      min={field.min}
      max={field.max}
      step={field.step}
      defaultValue={asPosted(seed)[0]}
    />
  );
}
