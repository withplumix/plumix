import type { Rule } from "eslint";

/**
 * Every node that can carry parameters, and every pattern a parameter can be
 * spelled as.
 */
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
/**
 * `private x: object` wraps the pattern in a TSParameterProperty, `x: object =
 * {}` in an AssignmentPattern; a constructor can do both.
 */
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
 * Only the bare keyword reports: nested in a wider type like `WeakSet<object>`
 * it is a real constraint.
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
