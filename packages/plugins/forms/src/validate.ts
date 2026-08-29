import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { labelSourceText } from "plumix/i18n";

import type { SubmittedValue, SubmittedValues } from "./answers.js";
import type { FormFieldError } from "./types.js";
import {
  asGroup,
  asRows,
  holdsNoAnswer,
  isBlank,
  maxRows,
  minRows,
  visibleFields,
} from "./answers.js";
import {
  emailMessage,
  outOfRangeMessage,
  requiredMessage,
  tooFewRowsMessage,
  tooLongMessage,
  tooManyRowsMessage,
  urlMessage,
} from "./messages.js";
import { fieldName, rowName } from "./paths.js";

// The pattern a browser applies to `<input type="email">`, from the HTML
// standard's "valid e-mail address" definition. Deliberately the same one:
// a visitor with JavaScript disabled meets the browser's check and a
// visitor with it enabled meets this one, and a form that submits in one
// has to submit in the other.
const EMAIL =
  /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;

// `new URL` in a `try` rather than `URL.parse`, which the island would
// ship to a browser that may not have it — this module is the one the
// server and the wizard share, and a throw here would leave a visitor at
// a Next button that has already cancelled its own submit.
function urlIsValid(answer: string): boolean {
  try {
    const { protocol } = new URL(answer);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function fieldError(
  field: MetaBoxFieldManifestEntry,
  value: unknown,
): string | null {
  const label = labelSourceText(field.label);
  if (isBlank(value)) {
    return field.required === true ? requiredMessage(label) : null;
  }
  if (typeof value === "number") {
    const { min, max } = field;
    if (
      (typeof min === "number" && value < min) ||
      (typeof max === "number" && value > max)
    ) {
      return outOfRangeMessage(label, min, max);
    }
    return null;
  }
  if (typeof value !== "string") return null;
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    return tooLongMessage(label, field.maxLength);
  }
  if (field.inputType === "email" && !EMAIL.test(value)) {
    return emailMessage(label);
  }
  if (field.inputType === "url" && !urlIsValid(value)) {
    return urlMessage(label);
  }
  return null;
}

/**
 * Whether the rows that came back are a number the repeater accepts. The
 * floor counts the rows the visitor actually used, since a form served
 * with more rows than they had things to say is the ordinary case. The
 * ceiling counts the rows themselves: the markup never renders more than
 * the maximum, so a body carrying more is refused whether or not the
 * excess is blank. The ceiling is judged first — a body carrying more
 * rows than the form takes is read only as far as the cap, so what it
 * put past there cannot be counted towards the floor.
 */
function rowCountError(
  field: MetaBoxFieldManifestEntry,
  rows: number,
  filled: number,
): string | null {
  const label = labelSourceText(field.label);
  const max = maxRows(field);
  if (rows > max) return tooManyRowsMessage(label, max);
  const min = minRows(field);
  return filled < min ? tooFewRowsMessage(label, min) : null;
}

function walk(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
  parent: string | undefined,
  errors: FormFieldError[],
): void {
  for (const field of visibleFields(fields, values)) {
    const name = fieldName(parent, field.key);
    const value: SubmittedValue = values[field.key];
    const children = field.subFields ?? [];

    if (field.inputType === "group") {
      const members = asGroup(value);
      if (field.required === true && holdsNoAnswer(children, members)) {
        errors.push({
          field: name,
          message: requiredMessage(labelSourceText(field.label)),
        });
      }
      walk(children, members, name, errors);
      continue;
    }

    if (field.inputType === "repeater") {
      // Numbered by where the row sits on the page rather than by where
      // it lands in the stored array, so an error names the control the
      // visitor is looking at. A row nobody filled in is asked nothing,
      // since it will not be stored either.
      const rows = asRows(value);
      const filled = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !holdsNoAnswer(children, row));
      const message = rowCountError(field, rows.length, filled.length);
      if (message !== null) errors.push({ field: name, message });
      for (const { row, index } of filled) {
        walk(children, row, rowName(name, index), errors);
      }
      continue;
    }

    const message = fieldError(field, value);
    if (message !== null) errors.push({ field: name, message });
  }
}

/**
 * Every answer the form cannot accept, in the order it declares its
 * fields — which is the order the error summary reads them out in, and
 * the order a visitor meets the controls on the page.
 *
 * Judged over the fields the answers leave visible, so a question the
 * visitor was never shown cannot hold their submission up — inside a
 * repeater row and a group as well as at the top of the form, each
 * against its own siblings. `tel` and `date` carry no shape check here:
 * a telephone number has no canonical form worth refusing one over, and
 * a date control posts an ISO string or nothing at all.
 */
export function validateAnswers(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): readonly FormFieldError[] {
  const errors: FormFieldError[] = [];
  walk(fields, values, undefined, errors);
  return errors;
}
