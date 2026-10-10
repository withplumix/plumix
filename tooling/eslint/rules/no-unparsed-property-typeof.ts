import type { Rule } from "eslint";
import ts from "typescript";

import { commentBlockAbove, wordsAfterMarker } from "./comment-block.js";
import { readTypeAwareServices } from "./type-services.js";

/**
 * No serialized value is a function or symbol, so asking is a structural
 * question about the value in hand, not a skipped decode.
 */
const UNSERIALIZABLE_TAGS = new Set(["function", "symbol"]);

/**
 * A boundary that cannot be decoded yet says so, and says what is holding the
 * schema up.
 */
const NOT_PARSED_MARKER = /(^|\s)not\s+parsed\b/i;
const MIN_REASON_WORDS = 6;

/** Whether the compiler knows nothing at all about this value. */
function isOpaque(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

interface PropertyRead {
  readonly object: ts.Expression;
  readonly key: string;
}

/** The object and key of a property read, or null for anything else. */
function propertyRead(node: ts.Node): PropertyRead | null {
  if (ts.isPropertyAccessExpression(node)) {
    return { object: node.expression, key: node.name.text };
  }
  if (!ts.isElementAccessExpression(node)) return null;
  const argument = node.argumentExpression;
  return {
    object: node.expression,
    // A computed key reads back as the expression that produced it; a literal
    // one reads as itself, without the quotes it was written with.
    key: ts.isStringLiteralLike(argument) ? argument.text : argument.getText(),
  };
}

/**
 * Every surviving dictionary names itself and says why it is not JSON, so a
 * key read off it is sanctioned. The number index covers `unknown[]`.
 */
function isDictionary(checker: ts.TypeChecker, object: ts.Expression): boolean {
  const type = checker.getApparentType(checker.getTypeAtLocation(object));
  const arms = type.isUnion() ? type.types : [type];
  return arms.some((arm) => {
    const indexed =
      arm.getStringIndexType() !== undefined ||
      arm.getNumberIndexType() !== undefined;
    // Declared members plus an index signature (valibot's `looseObject`) is a
    // shape with an undecoded leftovers slot, not a bag.
    return indexed && !(arm.isIntersection() && arm.getProperties().length > 0);
  });
}

/**
 * An uncompared `typeof` answers yes: what it is measured against is not
 * visible here.
 */
function asksForASerializableTag(node: Rule.Node): boolean {
  const comparison: Rule.Node | null = node.parent;
  if (comparison?.type !== "BinaryExpression") return true;
  const { operator, left, right } = comparison;
  if (!operator.startsWith("==") && !operator.startsWith("!=")) return true;
  const tag = left === node ? right : left;
  return !(
    tag.type === "Literal" &&
    typeof tag.value === "string" &&
    UNSERIALIZABLE_TAGS.has(tag.value)
  );
}

/**
 * A `typeof` never owns a line, so its note sits above the innermost
 * statement. Matched by suffix, since a list that fell behind ESTree would
 * anchor too far out.
 */
function enclosingStatement(node: Rule.Node): Rule.Node {
  let current: Rule.Node = node;
  for (;;) {
    if (current.type.endsWith("Statement")) return current;
    if (current.type.endsWith("Declaration")) return current;
    const parent: Rule.Node | null = current.parent;
    if (parent === null) return current;
    current = parent;
  }
}

/**
 * A bare `unknown` stays silent so a valibot `v.custom` predicate isn't
 * reported for parsing. Unlike upstream, `typeof` on a known union stays
 * allowed.
 */
export const noUnparsedPropertyTypeof: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `typeof` on a property read off a value the compiler knows nothing about.",
    },
    messages: {
      unparsedProperty:
        "Nothing has decoded `{{ property }}`, so narrowing it here by hand is a parse the boundary still owes. Decode the value with a valibot schema and read a typed field off the result. Where the boundary genuinely cannot be decoded yet, keep the check with a `Not parsed: …` sentence in the comment directly above this statement, naming what is holding the schema up (issue #1822).",
      unparsedPropertyReasonTooThin:
        "A `Not parsed:` note has to give the reason, not merely mark the check — name what stops a schema decoding this value here (issue #1822).",
    },
    schema: [],
  },
  create(context) {
    // Without a checker an undecoded value looks like a known union, so
    // reporting would fire on every permitted idiom.
    const services = readTypeAwareServices(context);
    if (!services) return {};
    const checker = services.program.getTypeChecker();
    return {
      "UnaryExpression[operator='typeof']"(node: Rule.Node) {
        if (node.type !== "UnaryExpression") return;
        if (!asksForASerializableTag(node)) return;
        const operand = services.esTreeNodeToTSNodeMap.get(node.argument);
        if (!operand) return;
        const read = propertyRead(operand);
        if (!read) return;
        if (!isOpaque(checker.getTypeAtLocation(operand))) return;
        if (isDictionary(checker, read.object)) return;
        const words = wordsAfterMarker(
          commentBlockAbove(
            context.sourceCode,
            enclosingStatement(node).loc?.start.line ?? 0,
          ),
          NOT_PARSED_MARKER,
        );
        if (words === null) {
          context.report({
            node,
            messageId: "unparsedProperty",
            data: { property: read.key },
          });
        } else if (words < MIN_REASON_WORDS) {
          context.report({ node, messageId: "unparsedPropertyReasonTooThin" });
        }
      },
    };
  },
};
