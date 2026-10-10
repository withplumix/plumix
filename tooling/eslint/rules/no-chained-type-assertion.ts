import type { Rule } from "eslint";

import { commentBlockAbove, wordsAfterMarker } from "./comment-block.js";

/**
 * Rust's `// SAFETY:` convention, borrowed for the same job: mark the point
 * where the compiler stopped checking and the author started promising.
 */
const SAFETY_MARKER = /(^|\s)safety:/i;

/**
 * A justification demanded everywhere decays into ritual, so the hatch costs
 * a sentence.
 */
const MIN_INVARIANT_WORDS = 6;

/**
 * The `// Safety:` note is read above the converted expression, not the
 * statement, so a buried assertion must be hoisted: a conversion worth an
 * invariant is worth a name.
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
        const words = wordsAfterMarker(
          commentBlockAbove(context.sourceCode, node.loc?.start.line ?? 0),
          SAFETY_MARKER,
        );
        if (words === null) {
          context.report({ node, messageId: "chainedTypeAssertion" });
          return;
        }
        if (words < MIN_INVARIANT_WORDS) {
          context.report({ node, messageId: "safetyCommentTooThin" });
        }
      },
    };
  },
};
