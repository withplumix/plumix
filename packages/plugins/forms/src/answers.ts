import type { JsonValue } from "plumix";
import type { MetaBoxFieldManifestEntry, MetaFieldValues } from "plumix/fields";
import { isFieldVisible } from "plumix/fields";

import type { FormAnswers } from "./types.js";

/**
 * What a checked box posts. A hidden input of the same name posts the
 * empty string beside it, so the key is on the body either way — see
 * `FormControl`, which renders the pair.
 */
export const TOGGLE_ON = "on";

/** One field's answer per key, a blank one as `undefined`. */
export type SubmittedValues = Readonly<Record<string, JsonValue | undefined>>;

/**
 * A declared default as the control would post it had nobody touched the
 * form. One shape for both sides: the renderer seeds the control from it
 * and the handler reads an unanswered field back through it, so the two
 * cannot drift.
 */
export function asPosted(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((item: unknown) => typeof item === "string");
  }
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  return [];
}

/**
 * One field's answer in the shape the field stores — a number for
 * `number`, a boolean for `toggle`, the option value for `select`.
 * `raw` is what the body carried under the field's name; `undefined`
 * means it carried nothing at all, and the field falls back to its
 * declared default.
 *
 * That fallback is what keeps the two sides honest. The markup is built
 * from defaults and a field the markup hid posts nothing, so without it
 * a hidden driver would read as its default at render and as blank at
 * submit — and every field it drives would flip between the two.
 */
function answerOf(
  field: MetaBoxFieldManifestEntry,
  raw: readonly string[] | undefined,
): JsonValue | undefined {
  if (field.inputType === "toggle") {
    return raw === undefined ? field.default === true : raw.includes(TOGGLE_ON);
  }

  if (field.inputType === "select") {
    // Restricted to the options the form declared, for the same reason
    // the answers are restricted to its fields: a value nobody offered
    // has no place to land, and admitting one would make the declared
    // option union a lie. This is also what drops the hidden input's
    // empty string from a multiple choice.
    const offered = new Set((field.options ?? []).map((o) => o.value));
    const given = raw ?? asPosted(field.default);
    const chosen = given.filter((value) => offered.has(value));
    return field.multiple ? chosen : chosen[0];
  }

  const answer = (raw ?? asPosted(field.default))[0]?.trim();
  if (answer === undefined || answer === "") return undefined;
  if (field.inputType !== "number") return answer;
  const parsed = Number(answer);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The answers a form holds before anyone has filled anything in. */
export function defaultAnswers(
  fields: readonly MetaBoxFieldManifestEntry[],
): SubmittedValues {
  return Object.fromEntries(
    fields.map((field) => [field.key, answerOf(field, undefined)]),
  );
}

/**
 * The answers a body carries. Blanks are included because a condition
 * may well be about a field the visitor left empty, and that rule cannot
 * be judged without them.
 */
export function readSubmittedValues(
  fields: readonly MetaBoxFieldManifestEntry[],
  body: URLSearchParams,
): SubmittedValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      answerOf(field, body.has(field.key) ? body.getAll(field.key) : undefined),
    ]),
  );
}

/**
 * The fields a form shows for one set of answers. Core's own
 * `isFieldVisible` decides, so the markup, the submit handler and the
 * admin's meta boxes all agree on what a condition means — and because
 * both sides judge a bag built by {@link answerOf}, an untouched form is
 * read exactly as it was served.
 */
export function visibleFields(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: MetaFieldValues,
): readonly MetaBoxFieldManifestEntry[] {
  return fields.filter((field) => isFieldVisible(field, values));
}

/**
 * The answers as stored, over the fields the submitted answers left
 * visible. An input the visitor added to the payload has no field to
 * land in and is dropped, and so is a field its own condition hid —
 * which is what keeps a hidden answer out of the row even when a script
 * put one in the body.
 *
 * Built by `fromEntries` rather than assignment: a field keyed
 * `__proto__` would otherwise set the object's prototype and lose the
 * answer.
 */
export function pickStoredAnswers(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): FormAnswers {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = values[field.key];
      return value === undefined ? [] : [[field.key, value] as const];
    }),
  );
}
