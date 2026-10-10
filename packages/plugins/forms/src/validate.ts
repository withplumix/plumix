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

// The HTML standard's `type="email"` pattern, so the browser's check and
// ours agree.
const EMAIL =
  /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;

// Not `URL.parse`: this also runs in the island, on browsers that may lack
// it.
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

// The floor counts filled rows; the ceiling counts all rows, blank or not,
// and is judged first since the body is read only up to the cap.
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
      // Numbered by page position, not stored index, so errors name the
      // visible control.
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
 * Only visible fields are judged, in declaration order. `tel` and `date`
 * get no shape check.
 */
export function validateAnswers(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): readonly FormFieldError[] {
  const errors: FormFieldError[] = [];
  walk(fields, values, undefined, errors);
  return errors;
}
