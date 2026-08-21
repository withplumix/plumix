import type { Rule } from "eslint";

// Every node that can carry parameters, and every pattern a parameter can be
// spelled as.
const FUNCTION_LIKE = [
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "TSConstructorType",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
  "TSFunctionType",
  "TSMethodSignature",
].join(", ");
const PARAMETER = "ArrayPattern, Identifier, ObjectPattern, RestElement";
// What the parameter list can wrap a pattern in before the annotation is
// reached: `private x: object` nests it in a TSParameterProperty, `x: object =
// {}` in an AssignmentPattern, and a constructor can do both at once.
const PARAMETER_WRAPPERS = [
  "",
  "AssignmentPattern > ",
  "TSParameterProperty > ",
  "TSParameterProperty > AssignmentPattern > ",
];

const PARAMETER_SELECTOR = PARAMETER_WRAPPERS.map(
  (wrapper) =>
    `:matches(${FUNCTION_LIKE}) > ${wrapper}:matches(${PARAMETER}) > TSTypeAnnotation > TSObjectKeyword`,
).join(", ");
const PROPERTY_SELECTOR =
  ":matches(PropertyDefinition, TSPropertySignature) > TSTypeAnnotation > TSObjectKeyword";

/**
 * `object` accepts every non-primitive and constrains none of them, so a
 * signature that takes one has described nothing it will do with the value.
 * The editor-to-canvas message protocol was typed this way at every endpoint
 * until #1814 gave it a union.
 *
 * Only the bare keyword reports. `object` nested in a wider type says
 * something: `WeakSet<object>` is the constraint weak collections impose, and
 * a dictionary of `object` is a different rule's business (issue #1807).
 * Return positions are out of scope too: a value handed back undescribed is
 * what the `unknown`-returns rule is for.
 */
export const noBareObjectInput: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow bare `object` as a parameter or property type.",
    },
    messages: {
      noBareObjectInput:
        "`object` accepts every non-primitive and describes none of them — `any` with better manners. Name the shape this input must have (a union of the messages a protocol carries, an interface, a `Record<string, T>`), or take `unknown` and decode it if the shape isn't known here (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    const report = (node: Rule.Node): void => {
      context.report({ node, messageId: "noBareObjectInput" });
    };
    return {
      [PARAMETER_SELECTOR]: report,
      [PROPERTY_SELECTOR]: report,
    };
  },
};
