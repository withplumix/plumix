import type { Rule } from "eslint";

type SourceCode = Rule.RuleContext["sourceCode"];

/**
 * The comments forming an unbroken block directly above `line`, joined into
 * one string. A comment trailing code (`foo(); // …`) ends on the line without
 * owning it and never joins the block — otherwise any line-end remark would
 * launder the declaration below it. Block comments arrive with their `*`
 * gutter attached; strip it so a word count measures prose rather than
 * decoration.
 */
export function commentBlockAbove(
  sourceCode: SourceCode,
  line: number,
): string {
  const ownLine = new Map<number, { text: string; start: number }>();
  for (const comment of sourceCode.getAllComments()) {
    const loc = comment.loc;
    if (!loc) continue;
    const before = sourceCode.lines[loc.start.line - 1]?.slice(
      0,
      loc.start.column,
    );
    if (before?.trim() !== "") continue;
    ownLine.set(loc.end.line, {
      text: comment.value.replaceAll(/^[\s*]+/gm, " "),
      start: loc.start.line,
    });
  }
  const parts: string[] = [];
  let comment = ownLine.get(line - 1);
  while (comment) {
    parts.unshift(comment.text);
    comment = ownLine.get(comment.start - 1);
  }
  return parts.join(" ");
}

const WORD = /[A-Za-z]/;

/**
 * How many words follow `marker` in `block`, or `null` when the marker is
 * absent. A rule can only check that a sentence was written, never that it is
 * true; counting words is the most a linter can insist on.
 */
export function wordsAfterMarker(block: string, marker: RegExp): number | null {
  const found = marker.exec(block);
  if (found === null) return null;
  return block
    .slice(found.index + found[0].length)
    .split(/\s+/)
    .filter((word) => WORD.test(word)).length;
}
