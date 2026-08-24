import type { Rule } from "eslint";
import ts from "typescript";

import { readTypeAwareServices } from "./type-services.js";

// Every node that can declare a return type. Method and property definitions
// are absent on purpose — they wrap a function expression, and the annotation
// hangs off the wrapped node.
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

// A parameter's annotation hangs off the parameter, so a return annotation is
// the only `TSTypeAnnotation` a function-like node owns directly.
const RETURN_ANNOTATION = `:matches(${FUNCTION_LIKE}) > TSTypeAnnotation`;
const UNKNOWN_RETURN = `${RETURN_ANNOTATION} > TSUnknownKeyword`;
// `Promise<unknown>` and its structural twin, which is what an interface
// mirroring a thenable tends to spell.
const PROMISE_OF_UNKNOWN_RETURN =
  `${RETURN_ANNOTATION} > TSTypeReference[typeName.name=/^(Promise|PromiseLike)$/]` +
  ` > TSTypeParameterInstantiation > TSUnknownKeyword`;

/**
 * The type the outside world expects this function to be, when there is one:
 * the member's own type on the contextual type of the object literal it sits
 * in, or the contextual type of the function expression itself.
 */
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
  // A class says which contracts it answers to rather than being handed one,
  // so the member is looked up on each interface it implements. Without this
  // the same trap would be excused as an object literal and reported as a
  // class.
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
 * Whether this signature is a type-level pattern rather than a contract: the
 * `extends` or `check` side of a conditional type, or a type parameter's own
 * constraint. `(...args: never[]) => unknown` there means "any function at
 * all" — it is the only spelling that matches every return type, it describes
 * shapes rather than producing values, and nobody calls through it.
 *
 * The constraint arm requires the signature to *be* the constraint. A
 * constraint that merely contains one (`T extends { run(): unknown }`) is a
 * bound that values flow through, so its members are contracts and report.
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
 * Whether the contract this function answers to already declares its return
 * open, in which case `unknown` is the narrowest honest answer available here.
 *
 * The test is the contextual signature's own declared return type, not the
 * type inferred for it: a callback whose result type the caller infers
 * (`array.map`) reads back as `unknown` only because this annotation is what
 * it inferred from, and that return was this file's to name. A declaration
 * that really does say `any` belongs to something outside this repo —
 * `no-explicit-any` keeps the repo's own from saying it — and one that says
 * `unknown` is reported where it is declared rather than at each site forced
 * to match it.
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

// The reported node is the `unknown` keyword; the signature it belongs to is
// the first function-like node above it.
function enclosingSignature(
  node: ts.Node,
): ts.SignatureDeclaration | undefined {
  for (let current = node; current.parent; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
}

/**
 * A declared return of `unknown` has not solved a typing problem, it has
 * exported one: every caller now owes a parse or an assertion, and callers
 * choose the assertion. Settling the debt here — where the value is produced
 * and its shape is still known — is what stops chained assertions being
 * manufactured downstream.
 *
 * `unknown` stays legal everywhere else: as a parameter (the correct type for
 * a value about to be decoded), inside a wider type, and as the return of a
 * function whose signature something outside this repo already fixed — a proxy
 * trap, a `JSON.parse` reviver. That last case is read from the contextual
 * type rather than a suppression comment, so it costs a correct signature
 * nothing and cannot be borrowed by an incorrect one.
 *
 * The match is on what the annotation says, so an alias (`type Lazy =
 * Promise<unknown>`) and a qualified name (`globalThis.Promise<unknown>`) slip
 * past. Both are deliberate: the same rule's twin, `no-unknown-type-alias`,
 * covers the aliases worth covering, and matching resolved types instead would
 * pull in every inferred return the annotation never claimed.
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
