import type { Rule } from "eslint";
import ts from "typescript";

import { readTypeAwareServices } from "./type-services.js";

/**
 * Every node that can declare a return type. Method and property definitions
 * are absent on purpose — they wrap a function expression, and the annotation
 * hangs off the wrapped node.
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

/**
 * A parameter's annotation hangs off the parameter, so a return annotation is
 * the only `TSTypeAnnotation` a function-like node owns directly.
 */
const RETURN_ANNOTATION = `:matches(${FUNCTION_LIKE}) > TSTypeAnnotation`;
const UNKNOWN_RETURN = `${RETURN_ANNOTATION} > TSUnknownKeyword`;
/**
 * `Promise<unknown>` and its structural twin, which is what an interface
 * mirroring a thenable tends to spell.
 */
const PROMISE_OF_UNKNOWN_RETURN =
  `${RETURN_ANNOTATION} > TSTypeReference[typeName.name=/^(Promise|PromiseLike)$/]` +
  ` > TSTypeParameterInstantiation > TSUnknownKeyword`;

function contextualFunctionType(
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Type | undefined {
  const member = ts.isMethodDeclaration(node)
    ? node
    : ts.isPropertyAssignment(node.parent)
      ? node.parent
      : undefined;
  if (!member) {
    return ts.isExpression(node) ? checker.getContextualType(node) : undefined;
  }
  if (!ts.isIdentifier(member.name)) return undefined;
  if (ts.isObjectLiteralExpression(member.parent)) {
    const literal = member.parent;
    const property = checker
      .getContextualType(literal)
      ?.getProperty(member.name.text);
    return property && checker.getTypeOfSymbolAtLocation(property, literal);
  }
  // A class names its contracts rather than being handed one, so the member
  // is looked up on each interface it implements.
  if (!ts.isClassLike(member.parent)) return undefined;
  const name = member.name.text;
  for (const clause of member.parent.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
    for (const implemented of clause.types) {
      const property = checker.getTypeAtLocation(implemented).getProperty(name);
      if (property) return checker.getTypeOfSymbolAtLocation(property, member);
    }
  }
  return undefined;
}

/**
 * Whether a type node leaves the value open — the shape an outside contract
 * takes when it genuinely cannot say what a callback hands back.
 */
function isOpenTypeNode(node: ts.TypeNode): boolean {
  if (
    node.kind === ts.SyntaxKind.AnyKeyword ||
    node.kind === ts.SyntaxKind.UnknownKeyword
  ) {
    return true;
  }
  if (!ts.isTypeReferenceNode(node)) return false;
  if (!ts.isIdentifier(node.typeName)) return false;
  if (
    node.typeName.text !== "Promise" &&
    node.typeName.text !== "PromiseLike"
  ) {
    return false;
  }
  const [argument] = node.typeArguments ?? [];
  return argument !== undefined && isOpenTypeNode(argument);
}

/**
 * In a conditional type or a constraint, `(...args: never[]) => unknown`
 * means "any function". A constraint merely containing one is a bound values
 * flow through, so reports.
 */
function isTypePattern(node: ts.Node): boolean {
  if (
    ts.isTypeParameterDeclaration(node.parent) &&
    node.parent.constraint === node
  ) {
    return true;
  }
  for (let child = node; child.parent; child = child.parent) {
    const parent = child.parent;
    if (
      ts.isConditionalTypeNode(parent) &&
      (parent.extendsType === child || parent.checkType === child)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Reads the declared return, not the inferred one: `array.map` infers
 * `unknown` from this very annotation, which was this file's to name.
 */
function returnIsNotOurs(context: Rule.RuleContext, node: Rule.Node): boolean {
  const services = readTypeAwareServices(context);
  const tsNode = services?.esTreeNodeToTSNodeMap.get(node);
  if (!services || !tsNode) return false;
  const signature = enclosingSignature(tsNode);
  if (!signature) return false;
  if (isTypePattern(signature)) return true;
  const checker = services.program.getTypeChecker();
  const contextual = contextualFunctionType(checker, signature);
  const signatures = contextual?.getNonNullableType().getCallSignatures() ?? [];
  return signatures.some((candidate) => {
    const declared = candidate.getDeclaration()?.type;
    return declared !== undefined && isOpenTypeNode(declared);
  });
}

/**
 * The reported node is the `unknown` keyword; the signature it belongs to is
 * the first function-like node above it.
 */
function enclosingSignature(
  node: ts.Node,
): ts.SignatureDeclaration | undefined {
  for (let current = node; current.parent; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
}

/**
 * A returned `unknown` exports the typing problem: every caller owes a parse,
 * and callers choose an assertion. Matching the annotation, not resolved
 * types, skips inferred returns.
 */
export const noUnknownReturn: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a declared return type of `unknown` or a promise of `unknown`.",
    },
    messages: {
      noUnknownReturn:
        "A function returning `unknown` hands every caller a parse it will skip. Return the shape this function actually produces: `JsonValue`/`JsonObject` for serialized data, a union naming the values it can hand back, or the output of the valibot schema that decodes the input. A function named as a parser must not return an unparsed value (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    const report = (node: Rule.Node): void => {
      if (returnIsNotOurs(context, node)) return;
      context.report({ node, messageId: "noUnknownReturn" });
    };
    return {
      [UNKNOWN_RETURN]: report,
      [PROMISE_OF_UNKNOWN_RETURN]: report,
    };
  },
};
