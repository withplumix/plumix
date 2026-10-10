import type { FormAnswers, FormLabelSnapshot } from "./types.js";
import { answerLines } from "./answer-lines.js";

const INDENT = "  ";

/**
 * Not in `messages.ts`: nothing here is shown to a visitor. A formatted
 * submission goes to whoever the site notifies, in the one language the
 * label snapshot is already written in.
 */
const WORDS = { yes: "Yes", no: "No" };

/**
 * Reads the row's label snapshot, so it survives the form being renamed
 * or removed. Unanswered questions are left out.
 */
export function formatSubmission(submission: {
  readonly answers: FormAnswers;
  readonly labels: FormLabelSnapshot;
}): string {
  return answerLines(submission.answers, submission.labels, WORDS)
    .flatMap(({ depth, label, row, text }) => {
      const pad = INDENT.repeat(depth);
      // A row is numbered rather than named, so it takes a full stop
      // where a field takes the colon its answer follows.
      const name = `${pad}${label}${row === undefined ? ":" : "."}`;
      if (text === null) return [name];
      // An answer that runs over several lines reads as a block under its
      // label; on one line it would be the label and a fragment.
      return text.includes("\n")
        ? [name, ...text.split("\n").map((line) => `${pad}${INDENT}${line}`)]
        : [`${name} ${text}`];
    })
    .join("\n");
}
