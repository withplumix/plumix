import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import { labelSourceText } from "plumix/i18n";

import type { SubmittedValues } from "./answers.js";
import type { FormFieldError } from "./types.js";
import {
  emailMessage,
  outOfRangeMessage,
  requiredMessage,
  tooLongMessage,
  urlMessage,
} from "./messages.js";

// The pattern a browser applies to `<input type="email">`, from the HTML
// standard's "valid e-mail address" definition. Deliberately the same one:
// a visitor with JavaScript disabled meets the browser's check and a
// visitor with it enabled meets this one, and a form that submits in one
// has to submit in the other.
const EMAIL =
  /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;

/**
 * Nothing was answered. `undefined` is what an empty control reads back
 * as; an unticked box reads `false` and an unchosen multiple choice an
 * empty list, and a field that insists on an answer means those too.
 */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  if (value === false) return true;
  return Array.isArray(value) && value.length === 0;
}

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
 * Every answer the form cannot accept, in the order it declares its
 * fields — which is the order the error summary reads them out in, and
 * the order a visitor meets the controls on the page.
 *
 * Judged over the fields the answers leave visible, so a question the
 * visitor was never shown cannot hold their submission up. `tel` and
 * `date` carry no shape check here: a telephone number has no canonical
 * form worth refusing one over, and a date control posts an ISO string
 * or nothing at all.
 */
export function validateAnswers(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): readonly FormFieldError[] {
  const errors: FormFieldError[] = [];
  for (const field of fields) {
    const message = fieldError(field, values[field.key]);
    if (message !== null) errors.push({ field: field.key, message });
  }
  return errors;
}
