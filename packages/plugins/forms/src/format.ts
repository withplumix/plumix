import type { JsonValue } from "plumix";
import { isJsonArray, isJsonObject } from "plumix";

import type {
  FieldLabelSnapshot,
  FormAnswers,
  FormLabelSnapshot,
} from "./types.js";

const INDENT = "  ";

// Not in `messages.ts`: nothing here is shown to a visitor. A formatted
// submission goes to whoever the site notifies, in the one language the
// label snapshot is already written in.
const YES = "Yes";
const NO = "No";

function scalarText(
  field: FieldLabelSnapshot | undefined,
  value: JsonValue,
): string {
  if (typeof value === "boolean") return value ? YES : NO;
  if (typeof value === "string") return field?.options?.[value] ?? value;
  if (typeof value === "number") return String(value);
  // Composite values are rendered by the caller; this is the floor under
  // a shape no field produces, and JSON is the one reading of it that
  // cannot lose what was stored.
  return JSON.stringify(value);
}

function lines(
  answers: FormAnswers,
  labels: FormLabelSnapshot,
  depth: number,
): string[] {
  // The snapshot's order is the form's own field order, so it leads;
  // anything the answers carry that it does not name — a field dropped
  // from the form since — follows under its raw key rather than
  // vanishing.
  const keys = [
    ...Object.keys(labels),
    ...Object.keys(answers).filter((key) => !(key in labels)),
  ];
  const pad = INDENT.repeat(depth);
  return keys.flatMap((key) => {
    const field = labels[key];
    const label = field?.label ?? key;
    const value = answers[key];
    if (value === undefined || value === null) return [];

    // A repeater: one numbered block per row, each read through the
    // row's own labels.
    if (isJsonArray(value) && value.some((item) => isJsonObject(item))) {
      return [
        `${pad}${label}:`,
        ...value.flatMap((row, index) =>
          isJsonObject(row)
            ? [
                `${pad}${INDENT}${String(index + 1)}.`,
                ...lines(row, field?.fields ?? {}, depth + 2),
              ]
            : [`${pad}${INDENT}${scalarText(field, row)}`],
        ),
      ];
    }
    if (isJsonArray(value)) {
      const items = value.map((item) => scalarText(field, item));
      return [`${pad}${label}: ${items.join(", ")}`];
    }
    // A group: its members under it, read through the group's labels.
    if (isJsonObject(value)) {
      return [
        `${pad}${label}:`,
        ...lines(value, field?.fields ?? {}, depth + 1),
      ];
    }
    const text = scalarText(field, value);
    // An answer that runs over several lines reads as a block under its
    // label; on one line it would be the label and a fragment.
    return text.includes("\n")
      ? [
          `${pad}${label}:`,
          ...text.split("\n").map((line) => `${pad}${INDENT}${line}`),
        ]
      : [`${pad}${label}: ${text}`];
  });
}

/**
 * A submission as readable text — every answer under what its field was
 * called, in the order the form asked. Written for the body of a
 * notification email, so a handler does not hand-roll formatting:
 *
 *     onSubmit: ({ ctx, ...submission }) =>
 *       send({ text: formatSubmission(submission) }),
 *
 * It reads the row's own label snapshot rather than the live form, so a
 * submission still renders correctly after the form is renamed or
 * removed. A question the visitor left unanswered is left out.
 */
export function formatSubmission(submission: {
  readonly answers: FormAnswers;
  readonly labels: FormLabelSnapshot;
}): string {
  return lines(submission.answers, submission.labels, 0).join("\n");
}
