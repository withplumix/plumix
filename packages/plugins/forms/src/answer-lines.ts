import type { JsonValue } from "plumix";

import type {
  FieldLabelSnapshot,
  FormAnswers,
  FormLabelSnapshot,
} from "./types.js";

/**
 * What a checkbox answer is called, in whichever language the reader is
 * being written for — English for the notification email a handler
 * sends, the administrator's own locale in the inbox. The traversal
 * takes them rather than choosing, because it serves both.
 */
export interface AnswerWords {
  readonly yes: string;
  readonly no: string;
}

/**
 * One answer, named by the field that asked for it. A composite — a
 * group, a repeater, one of its rows — carries no text of its own: the
 * lines under it, at a greater `depth`, are its answers.
 */
export interface AnswerLine {
  /** Where the answer sits: `referees.0.name`. Unique in one submission. */
  readonly path: string;
  readonly depth: number;
  /** What the field was called; a repeater row's own number. */
  readonly label: string;
  readonly text: string | null;
  /** A repeater row's position, 1-based. Absent on every other line. */
  readonly row?: number;
}

// Local guards rather than core's, for two reasons. This module is what
// the admin chunk reads a stored submission through, and a runtime import
// from `plumix` would pull the engine into the browser bundle. And a bare
// `Array.isArray` on a `JsonValue` narrows the true branch to `any[]`,
// throwing away every constraint the compiler could have checked — naming
// the predicate is what keeps the narrowing honest.
function isRecord(
  value: JsonValue,
): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function scalarText(
  field: FieldLabelSnapshot | undefined,
  value: JsonValue,
  words: AnswerWords,
): string {
  if (typeof value === "boolean") return value ? words.yes : words.no;
  if (typeof value === "string") return field?.options?.[value] ?? value;
  if (typeof value === "number") return String(value);
  // Composite values are rendered by the caller; this is the floor under
  // a shape no field produces, and JSON is the one reading of it that
  // cannot lose what was stored.
  return JSON.stringify(value);
}

/**
 * One answer on one line — what a table cell shows. A composite is
 * flattened rather than summarised: rows are separated from each other,
 * members within a row from one another.
 */
export function answerText(
  value: JsonValue | undefined,
  field: FieldLabelSnapshot | undefined,
  words: AnswerWords,
): string {
  if (value === undefined || value === null) return "";
  if (isList(value)) {
    const first = value[0];
    // Rows are separated from each other more strongly than the members
    // within one row, so a repeater does not read as one long list.
    const separator = first !== undefined && isRecord(first) ? "; " : ", ";
    return value
      .map((item) => answerText(item, field, words))
      .filter((text) => text !== "")
      .join(separator);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, member]) => answerText(member, field?.fields?.[key], words))
      .filter((text) => text !== "")
      .join(", ");
  }
  return scalarText(field, value, words);
}

/**
 * A submission read through its own label snapshot, flat enough to
 * render as text or as DOM and nested enough to say what belongs to
 * what. The snapshot's order leads — it is the form's own field order —
 * and anything the answers carry that it does not name follows under its
 * raw key rather than vanishing.
 */
export function answerLines(
  answers: FormAnswers,
  labels: FormLabelSnapshot,
  words: AnswerWords,
  depth = 0,
  prefix = "",
): AnswerLine[] {
  const keys = [
    ...Object.keys(labels),
    ...Object.keys(answers).filter((key) => !(key in labels)),
  ];
  return keys.flatMap((key) => {
    const field = labels[key];
    const label = field?.label ?? key;
    const value = answers[key];
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (value === undefined || value === null) return [];

    // A repeater: one numbered block per row, each read through the
    // row's own labels.
    if (isList(value) && value.some((item) => isRecord(item))) {
      return [
        { path, depth, label, text: null },
        ...value.flatMap((row, index) => {
          const rowPath = `${path}.${String(index)}`;
          return isRecord(row)
            ? [
                {
                  path: rowPath,
                  depth: depth + 1,
                  label: String(index + 1),
                  text: null,
                  row: index + 1,
                },
                ...answerLines(
                  row,
                  field?.fields ?? {},
                  words,
                  depth + 2,
                  rowPath,
                ),
              ]
            : [
                {
                  path: rowPath,
                  depth: depth + 1,
                  label: String(index + 1),
                  text: scalarText(field, row, words),
                  row: index + 1,
                },
              ];
        }),
      ];
    }
    if (isList(value)) {
      return [{ path, depth, label, text: answerText(value, field, words) }];
    }
    // A group: its members under it, read through the group's labels.
    if (isRecord(value)) {
      return [
        { path, depth, label, text: null },
        ...answerLines(value, field?.fields ?? {}, words, depth + 1, path),
      ];
    }
    return [{ path, depth, label, text: scalarText(field, value, words) }];
  });
}
