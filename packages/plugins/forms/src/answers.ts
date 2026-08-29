import type { JsonValue } from "plumix";
import type { MetaBoxFieldManifestEntry, MetaFieldValues } from "plumix/fields";
import { isFieldVisible } from "plumix/fields";

import type { FormAnswers } from "./types.js";
import { MAX_REPEATER_ROWS } from "./contract.js";
import { fieldName, rowMarkerName, rowName } from "./paths.js";

/**
 * What a checked box posts. A hidden input of the same name posts the
 * empty string beside it, so the key is on the body either way — see
 * `FormControl`, which renders the pair.
 */
export const TOGGLE_ON = "on";

/**
 * One field's answer: a scalar for an ordinary control, the members'
 * answers for a group, one bag per row for a repeater. Composites nest,
 * so this recurses exactly as the fields do.
 */
export type SubmittedValue =
  JsonValue | undefined | SubmittedValues | readonly SubmittedValues[];

/**
 * One field's answer per key, a blank one as `undefined`. An interface
 * rather than a `Record` alias so the recursion through
 * {@link SubmittedValue} is one TypeScript will defer.
 */
export interface SubmittedValues {
  readonly [key: string]: SubmittedValue;
}

/** Everything a body carried, indexed once so a nested read is a lookup. */
type Posted = ReadonlyMap<string, readonly string[]>;

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
 * Nothing was answered. `undefined` is what an empty control reads back
 * as; an unticked box reads `false` and an unchosen multiple choice an
 * empty list, and a field that insists on an answer means those too.
 */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  if (value === false) return true;
  return Array.isArray(value) && value.length === 0;
}

// Both guards are read only off a composite field's own key, where the
// value can only be what the composite put there. Written as predicates
// because `Array.isArray` narrows a `JsonValue` union to `any[]`, which
// turns every downstream read unsafe.
function isRowList(value: SubmittedValue): value is readonly SubmittedValues[] {
  return Array.isArray(value);
}

function isBag(value: SubmittedValue): value is SubmittedValues {
  return typeof value === "object" && value !== null && !isRowList(value);
}

/** A group's answers, whatever a caller was holding at that key. */
export function asGroup(value: SubmittedValue): SubmittedValues {
  return isBag(value) ? value : {};
}

/**
 * A repeater's rows, whatever a caller was holding at that key. Anything
 * in the list that is not a bag of answers is dropped rather than counted
 * — a theme rendering its own controls manages their own rows, and
 * `delete rows[i]` leaves
 * a hole that reads back as `undefined`. Every other caller hands this a
 * list the read side built, where the question does not arise.
 */
export function asRows(value: SubmittedValue): readonly SubmittedValues[] {
  return isRowList(value) ? value.filter(isBag) : [];
}

/**
 * How many rows a repeater takes. A repeater without a declared `.max()`
 * still has one — see {@link MAX_REPEATER_ROWS}.
 */
export function maxRows(field: MetaBoxFieldManifestEntry): number {
  return typeof field.max === "number" ? field.max : MAX_REPEATER_ROWS;
}

/** How few rows it takes — one, once it is `.required()`. */
export function minRows(field: MetaBoxFieldManifestEntry): number {
  const declared = typeof field.min === "number" ? field.min : 0;
  return field.required === true ? Math.max(declared, 1) : declared;
}

/**
 * How many rows a blank form is served with: the fewest it accepts, but
 * never none — a repeater with no row on the page is a question a visitor
 * without JavaScript can never answer.
 */
export function initialRowCount(field: MetaBoxFieldManifestEntry): number {
  return Math.min(Math.max(minRows(field), 1), maxRows(field));
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

/**
 * One level of a form's answers, from a body or — with no body at all —
 * from the defaults the blank form is served with. One walk for both, so
 * the shape the markup is built from and the shape the handler reads back
 * cannot drift apart.
 */
function readLevel(
  fields: readonly MetaBoxFieldManifestEntry[],
  posted: Posted | undefined,
  parent: string | undefined,
): SubmittedValues {
  return Object.fromEntries(
    fields.map((field): [string, SubmittedValue] => {
      const name = fieldName(parent, field.key);
      if (field.inputType === "group") {
        return [field.key, readLevel(field.subFields ?? [], posted, name)];
      }
      if (field.inputType === "repeater") {
        // One marker per row the visitor was shown, so the count is the
        // rows themselves rather than a number a body could disagree
        // with. Read one past what the repeater accepts, which is how the
        // count check sees that more rows came back than it takes.
        const rows =
          posted === undefined
            ? initialRowCount(field)
            : Math.min(
                posted.get(rowMarkerName(name))?.length ?? 0,
                maxRows(field) + 1,
              );
        return [
          field.key,
          Array.from({ length: rows }, (_, index) =>
            readLevel(field.subFields ?? [], posted, rowName(name, index)),
          ),
        ];
      }
      return [field.key, answerOf(field, posted?.get(name))];
    }),
  );
}

/**
 * The answers a form holds before anyone has filled anything in — a
 * blank bag per group, and one blank row bag per row the markup serves.
 */
export function defaultAnswers(
  fields: readonly MetaBoxFieldManifestEntry[],
): SubmittedValues {
  return readLevel(fields, undefined, undefined);
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
  const posted = new Map<string, string[]>();
  for (const [name, value] of body) {
    const seen = posted.get(name);
    if (seen) seen.push(value);
    else posted.set(name, [value]);
  }
  return readLevel(fields, posted, undefined);
}

/**
 * The fields a form shows for one set of answers. Core's own
 * `isFieldVisible` decides, so the markup, the submit handler and the
 * admin's meta boxes all agree on what a condition means — and because
 * both sides judge a bag built by {@link answerOf}, an untouched form is
 * read exactly as it was served.
 *
 * A repeater row is its own scope: the values handed in are that row's,
 * so a rule inside a row is answered by that row's siblings and says
 * nothing about the row next to it.
 */
export function visibleFields(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: MetaFieldValues,
): readonly MetaBoxFieldManifestEntry[] {
  return fields.filter((field) => isFieldVisible(field, values));
}

const holdsNothing = (stored: FormAnswers): boolean =>
  Object.values(stored).every(isBlank);

/**
 * Whether a scope holds an answer at all, once its own conditions apply.
 * A repeater row that does not is dropped rather than stored blank, and a
 * group that does not has not met a `.required()` — the same rule
 * `isBlank` applies one field at a time.
 */
export function holdsNoAnswer(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): boolean {
  return holdsNothing(pickStoredAnswers(fields, values));
}

function storedValue(
  field: MetaBoxFieldManifestEntry,
  value: SubmittedValue,
): JsonValue | undefined {
  const children = field.subFields ?? [];
  if (field.inputType === "group") {
    const members = pickStoredAnswers(children, asGroup(value));
    return Object.keys(members).length === 0 ? undefined : members;
  }
  if (field.inputType === "repeater") {
    const rows = asRows(value)
      .map((row) => pickStoredAnswers(children, row))
      .filter((row) => !holdsNothing(row));
    return rows.length === 0 ? undefined : rows;
  }
  // Safety: every other input type is read through `answerOf`, which
  // returns JSON — the two composites are the only source of the wider
  // `SubmittedValue`, and both are handled above.
  return value as JsonValue | undefined;
}

/**
 * The answers as stored, over the fields the submitted answers leave
 * visible. An input the visitor added to the payload has no field to
 * land in and is dropped, and so is a field its own condition hid —
 * which is what keeps a hidden answer out of the row even when a script
 * put one in the body.
 *
 * A repeater stores an array of row objects, a group one object under
 * its own key, and each recurses through the same rule — including the
 * conditions, judged inside the row or group that declares them. A row
 * nobody filled in is not an answer, so it is dropped rather than stored
 * blank; a composite left with nothing is dropped entirely, exactly as a
 * scalar nobody answered is.
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
    visibleFields(fields, values).flatMap((field) => {
      const value = storedValue(field, values[field.key]);
      return value === undefined ? [] : [[field.key, value] as const];
    }),
  );
}

/**
 * One level of a form's answers, written back out as the body a filled-in
 * form would have posted. The mirror of {@link readLevel}, and it sits
 * beside it for that reason: the two spellings of one field's name have to
 * stay one.
 */
function writeLevel(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
  body: URLSearchParams,
  parent: string | undefined,
): void {
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined) continue;
    const name = fieldName(parent, field.key);
    const children = field.subFields ?? [];
    if (field.inputType === "group") {
      writeLevel(children, asGroup(value), body, name);
      continue;
    }
    if (field.inputType === "repeater") {
      // Numbered by where the row is written rather than by where the
      // caller held it: the read side counts the markers and then reads
      // indices from zero, so a caller's array with a hole in it would
      // otherwise put an answer under a name nothing looks for.
      let position = 0;
      for (const row of asRows(value)) {
        // The marker the read side counts rows by — one per row, exactly
        // as the rendered markup emits it.
        body.append(rowMarkerName(name), "");
        writeLevel(children, row, body, rowName(name, position));
        position += 1;
      }
      continue;
    }
    if (field.inputType === "toggle") {
      // The pair a checkbox posts: the empty answer that says the field
      // was on the form at all, and the `on` a ticked box adds. Without
      // the first, switching a toggle off would read as "was never shown
      // this field" and fall back to a default that is on.
      body.append(name, "");
      if (value === true) body.append(name, TOGGLE_ON);
      continue;
    }
    // A multiple choice posts the same empty answer beside itself, for
    // the same reason: emptied has to read as emptied rather than as a
    // field the visitor was never shown.
    if (field.inputType === "select" && field.multiple === true) {
      body.append(name, "");
    }
    for (const posted of asPosted(value)) body.append(name, posted);
  }
}

/**
 * A form's answers as the urlencoded body its markup would have posted —
 * what `usePlumixForm` submits, so a form filled in by a theme's own
 * controls reaches the endpoint as the same request a rendered form makes
 * and is validated and stored identically. The inverse of
 * {@link readSubmittedValues}.
 *
 * Only fields the form declares are written, so an extra key a caller put
 * in the bag has nowhere to land — the same rule {@link pickStoredAnswers}
 * applies to an input a visitor added to the payload. A field the bag says
 * nothing about is left out entirely rather than written blank, which is
 * what makes an omitted answer read back as the field's declared default:
 * what a visitor served the blank form and leaving it alone would have
 * posted.
 */
export function writeSubmittedValues(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): URLSearchParams {
  const body = new URLSearchParams();
  writeLevel(fields, values, body, undefined);
  return body;
}
