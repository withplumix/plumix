import type { Rule } from "eslint";
import ts from "typescript";

import { commentBlockAbove, wordsAfterMarker } from "./comment-block.js";
import { readTypeAwareServices } from "./type-services.js";

// The two answers `typeof` can give that no serialized value ever produces.
// Asking for either is asking whether the object carries a member — a live
// binding's method, a `toJSON`, a thenable's `then`, React's symbol brand —
// which is a structural question about the value in hand, not a decode that
// was skipped. No schema has anything to say about it.
const UNSERIALIZABLE_TAGS = new Set(["function", "symbol"]);

// The third marker in the family that `// Safety:` (#1816) and `Not JSON:`
// (#1820) already belong to. A boundary that cannot be decoded yet says so,
// and says what is holding the schema up.
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
 * Whether this value is a dictionary — a bag whose index signature already
 * declares that its values are undescribed. #1820 made every surviving one
 * name itself and state why it is not JSON, so a key read off it is the
 * sanctioned use of the bag rather than a shape claimed without evidence. The
 * number index covers the same thing spelled as a list: an element of an
 * `unknown[]` is undescribed because the array said so.
 */
function isDictionary(checker: ts.TypeChecker, object: ts.Expression): boolean {
  const type = checker.getApparentType(checker.getTypeAtLocation(object));
  const arms = type.isUnion() ? type.types : [type];
  return arms.some((arm) => {
    const indexed =
      arm.getStringIndexType() !== undefined ||
      arm.getNumberIndexType() !== undefined;
    // An intersection that mixes declared members with an index signature is
    // not a bag — it is a shape with a leftovers slot, which is what valibot's
    // `looseObject` infers. Its declared half is described and its other half
    // is exactly the undecoded remainder this rule is about, so the bag
    // exemption would launder the second on the strength of the first.
    return indexed && !(arm.isIntersection() && arm.getProperties().length > 0);
  });
}

/**
 * Whether this `typeof` is compared against a tag serialized data can hold.
 * An uncompared `typeof` (its result stored, or switched on) answers yes: what
 * it will be measured against is not visible here.
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
 * The statement this check sits in — where a note about it belongs. The anchor
 * is the innermost one rather than the enclosing function: a `typeof` is a
 * clause inside a condition and can never own a line of its own, so demanding
 * a note directly above it (the anchoring `no-chained-type-assertion` uses)
 * would force every guarded read to be hoisted into a binding first, and one
 * note above the function would cover checks on values it never mentions.
 *
 * Statements are recognised by suffix rather than by a list: every ESTree
 * statement ends in `Statement` or `Declaration`, and a list that fell behind
 * the AST would silently anchor the lookup too far out.
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
 * A `typeof` on a field read off a value the compiler knows nothing about is
 * hand-narrowing where a schema should have decoded (issue #1822). It catches
 * two shapes, and the difference between them is worth keeping in view:
 *
 * - The object is `any`. `json.access_token` type-checks only because someone
 *   decided `json` has that field, so the `typeof` tests the leaf and leaves
 *   the claim about the object standing on nothing.
 * - The leaf is honestly declared `unknown` — `settings.value`, a stored bag's
 *   column. Nothing was assumed; the declaration deferred the parse, and this
 *   read is where the debt comes due. Deferring it again by hand is what the
 *   rule objects to.
 *
 * Four positions stay silent, and they are the specification as much as the
 * report is:
 *
 * - **A bare `unknown` or `any` value.** `unknown` is the correct input type
 *   for a function that decodes, and the first check inside one has nothing to
 *   reach through. Firing there would report a valibot `v.custom` predicate for
 *   doing the parsing this rule asks for.
 * - **A union the compiler already knows.** `typeof` picking an arm of `Label`
 *   or of an `EnvInput` config slot is the documented idiom, and the union is
 *   evidence the check merely recovers. The upstream rule this is adapted from
 *   bans `typeof` outright; that behaviour is explicitly not adopted.
 * - **A key read off a dictionary**, per `isDictionary` above.
 * - **A comparison against `"function"` or `"symbol"`**, per the tags above.
 *
 * Binding the read to an annotated local first (`const raw: unknown = bag.x`)
 * puts it in the first of those positions and the rule goes quiet. That is the
 * same escape `no-unsafe-dictionary` grants a `VariableDeclarator`, and for the
 * same reason: an annotation written by hand is a deliberate act a reader can
 * see, where a read buried in a condition is not. It is an escape, not a fix —
 * the honest one is a schema, or the note below.
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
    // Without a checker there is no way to tell an undecoded value from a
    // union the compiler knows, and reporting on syntax alone would fire on
    // every permitted idiom. Staying silent is the only safe posture.
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
