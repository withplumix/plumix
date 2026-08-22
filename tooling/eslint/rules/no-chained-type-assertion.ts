import type { Rule } from "eslint";

// Rust's `// SAFETY:` convention, borrowed for the same job: mark the point
// where the compiler stopped checking and the author started promising.
const SAFETY_MARKER = /(^|\s)safety:/i;

// A justification demanded everywhere decays into ritual, so the escape hatch
// has to cost something. Requiring a sentence is the most a linter can check —
// it cannot read the invariant, only insist that one was written.
const MIN_INVARIANT_WORDS = 6;
const WORD = /[A-Za-z]/;

type SourceCode = Rule.RuleContext["sourceCode"];

/**
 * The comments forming an unbroken block directly above `line`, joined into
 * one string. A comment trailing code (`foo(); // …`) ends on the line without
 * owning it and never joins the block — otherwise any line-end remark would
 * launder the assertion below it. Block comments arrive with their `*` gutter
 * attached; strip it so a word count measures prose rather than decoration.
 */
function commentBlockAbove(sourceCode: SourceCode, line: number): string {
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

/**
 * `x as unknown as Y` launders a value through the one type that erases every
 * constraint the compiler could have checked, so the conversion arrives with
 * its evidence deliberately removed.
 *
 * The escape hatch is a `// Safety:` comment on the preceding line stating the
 * invariant that makes the assertion sound — the honest case being a fluent
 * builder that erases a phantom type parameter it recovers on the way out.
 * "Preceding" is measured from where the converted expression starts, not from
 * the statement around it, so an assertion buried inside a multi-line call has
 * to be hoisted to its own binding before it can be justified. That is the
 * intended pressure: a conversion worth a written invariant is worth a name.
 * The rule can only check that a sentence was written, never that it is true;
 * what keeps the hatch meaningful is being rare enough that a reviewer reads
 * every one of them.
 */
export const noChainedTypeAssertion: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow a type assertion routed through `unknown`.",
    },
    messages: {
      chainedTypeAssertion:
        "Routing an assertion through `unknown` discards every constraint the compiler could have checked. Give the value an honest type — decode it with a valibot schema at the boundary it enters, or widen the declaration it flows into. If the conversion is genuinely load-bearing, state the invariant that makes it sound in a `// Safety: …` comment on the line directly above the one the converted expression starts on; hoist the assertion into its own binding if no such line exists (issue #1807).",
      safetyCommentTooThin:
        "A `// Safety:` comment has to state the invariant that makes this assertion sound, not merely mark it — write the sentence a reviewer would need in order to check the reasoning (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    return {
      "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']"(
        node: Rule.Node,
      ) {
        const block = commentBlockAbove(
          context.sourceCode,
          node.loc?.start.line ?? 0,
        );
        const marker = SAFETY_MARKER.exec(block);
        if (marker === null) {
          context.report({ node, messageId: "chainedTypeAssertion" });
          return;
        }
        const words = block
          .slice(marker.index + marker[0].length)
          .split(/\s+/)
          .filter((word) => WORD.test(word)).length;
        if (words < MIN_INVARIANT_WORDS) {
          context.report({ node, messageId: "safetyCommentTooThin" });
        }
      },
    };
  },
};
