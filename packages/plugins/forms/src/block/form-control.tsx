import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { ReactNode } from "react";
import { labelSourceText } from "plumix/i18n";

import { asPosted, TOGGLE_ON } from "../answers.js";

/**
 * Tells "chose nothing" from "never shown", which would fall back to the
 * default and undo the visitor's answer.
 */
function EmptyAnswer({ name }: { readonly name: string }): ReactNode {
  return <input type="hidden" name={name} value="" readOnly />;
}

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
  /**
   * What the answer posts under — the field's key, bracketed by its container.
   */
  readonly name: string;
  readonly id: string;
  /** Absent on a blank form, where the field's default seeds the control. */
  readonly answer?: unknown;
  /** Ids of the help text and error this control is described by. */
  readonly describedBy?: string;
  readonly invalid?: boolean;
  /**
   * Drops the browser's `required` in an optional repeater row, which the
   * server accepts blank.
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
