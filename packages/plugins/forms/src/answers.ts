import type { JsonValue } from "plumix";
import type { MetaBoxFieldManifestEntry, MetaFieldValues } from "plumix/fields";
import { isFieldVisible } from "plumix/fields";

import type { FormAnswers } from "./types.js";
import { MAX_REPEATER_ROWS } from "./contract.js";
import { fieldName, rowMarkerName, rowName } from "./paths.js";

/**
 * A hidden input of the same name posts "" beside it, so the key is on
 * the body either way.
 */
export const TOGGLE_ON = "on";

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

type Posted = ReadonlyMap<string, readonly string[]>;

/**
 * Shared by the renderer and the handler, so an untouched control reads
 * back exactly as it was served.
 */
export function asPosted(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((item: unknown) => typeof item === "string");
  }
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  return [];
}

/** An unticked box (`false`) and an empty multiple choice count as blank. */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  if (value === false) return true;
  return Array.isArray(value) && value.length === 0;
}

/** Predicates because `Array.isArray` narrows a `JsonValue` to `any[]`. */
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
 * Drops anything that isn't a bag, such as the hole `delete rows[i]`
 * leaves in a theme's own row list.
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
 * Never zero: a visitor without JavaScript could never answer a repeater
 * served with no row.
 */
export function initialRowCount(field: MetaBoxFieldManifestEntry): number {
  return Math.min(Math.max(minRows(field), 1), maxRows(field));
}

/**
 * `raw` undefined falls back to the default: a hidden field posts nothing,
 * and reading it as blank would flip every field its condition drives.
 */
function answerOf(
  field: MetaBoxFieldManifestEntry,
  raw: readonly string[] | undefined,
): JsonValue | undefined {
  if (field.inputType === "toggle") {
    return raw === undefined ? field.default === true : raw.includes(TOGGLE_ON);
  }

  if (field.inputType === "select") {
    // A value nobody offered would make the declared option union a lie.
    // Also drops the hidden input's empty string.
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

/** With no body, reads the defaults, so markup and handler share one walk. */
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
        // Counted from row markers, not a posted number. Reads one past
        // the max so the count check can see an overflow.
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
 * A repeater row is its own scope: a rule inside it is answered by that
 * row's siblings only.
 */
export function visibleFields(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: MetaFieldValues,
): readonly MetaBoxFieldManifestEntry[] {
  return fields.filter((field) => isFieldVisible(field, values));
}

const holdsNothing = (stored: FormAnswers): boolean =>
  Object.values(stored).every(isBlank);

/** Applies the scope's own conditions first, like `isBlank` per field. */
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
 * Drops undeclared inputs and hidden fields even if a script posted them.
 * Empty rows and composites are dropped, not stored blank.
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

/** The mirror of `readLevel`; field names must be spelled the same in both. */
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
      // Renumbered: the read side counts markers and reads from zero, so
      // a hole in the caller's array would misname answers.
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
      // Without the empty entry, an unticked toggle would read as never
      // shown and fall back to a default that may be on.
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
 * The inverse of {@link readSubmittedValues}. Undeclared keys are dropped;
 * an omitted field is left out, so it reads back as its default.
 */
export function writeSubmittedValues(
  fields: readonly MetaBoxFieldManifestEntry[],
  values: SubmittedValues,
): URLSearchParams {
  const body = new URLSearchParams();
  writeLevel(fields, values, body, undefined);
  return body;
}
