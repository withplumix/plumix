import type { NodePath } from "@babel/traverse";
import type { Node } from "@babel/types";
import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

const LOG_METHODS = new Set(["trace", "debug", "info", "log", "warn", "error"]);
const LOG_RECEIVER = /^(?:logger|log|console)$/;

function receiverName(node: Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && node.property.type === "Identifier")
    return node.property.name;
  return undefined;
}

function isLogCall(node: Node): boolean {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression")
    return false;
  const { object, property } = node.callee;
  return (
    property.type === "Identifier" &&
    LOG_METHODS.has(property.name) &&
    LOG_RECEIVER.test(receiverName(object) ?? "")
  );
}

/** `new FooError(code, message, details)`: callers branch on the code; the rest is prose. */
function isErrorProse(path: NodePath): boolean {
  const parent = path.parent;
  return (
    parent.type === "NewExpression" &&
    parent.callee.type === "Identifier" &&
    parent.callee.name.endsWith("Error") &&
    path.listKey === "arguments" &&
    typeof path.key === "number" &&
    path.key >= 1
  );
}

/** `x ?? ""`: the fallback an index read needs under `noUncheckedIndexedAccess`. */
function isEmptyFallback(path: NodePath): boolean {
  const { node, parent } = path;
  return (
    node.type === "StringLiteral" &&
    node.value === "" &&
    parent.type === "LogicalExpression" &&
    parent.operator === "??" &&
    parent.right === node
  );
}

const PROSE_KEYS = new Set(["label", "description"]);
/** `resolve.ts` sends a missing page's `missing` as its 404's `x-plumix-hint` debug header. */
const HINT_KEYS = new Set(["missing"]);

function isStringValueOf(path: NodePath, keys: ReadonlySet<string>): boolean {
  const { node, parent } = path;
  return (
    (node.type === "StringLiteral" || node.type === "TemplateLiteral") &&
    parent.type === "ObjectProperty" &&
    parent.value === node &&
    parent.key.type === "Identifier" &&
    keys.has(parent.key.name)
  );
}

function sameReference(a: Node, b: Node): boolean {
  if (a.type === "Identifier" && b.type === "Identifier")
    return a.name === b.name;
  if (a.type === "MemberExpression" && b.type === "MemberExpression") {
    return (
      a.property.type === "Identifier" &&
      b.property.type === "Identifier" &&
      a.property.name === b.property.name &&
      sameReference(a.object, b.object)
    );
  }
  return false;
}

/**
 * The test of `...(x === undefined ? {} : { k: x })`: flipping it only swaps an absent key for an
 * `undefined` one. The object's own mutants, which drop the key, stay.
 */
function isOptionalSpreadTest(path: NodePath): boolean {
  const ternary = path.parent;
  if (path.key !== "test" || ternary.type !== "ConditionalExpression")
    return false;
  if (path.parentPath.parent.type !== "SpreadElement") return false;
  const { test, consequent, alternate } = ternary;
  if (
    test.type !== "BinaryExpression" ||
    (test.operator !== "===" && test.operator !== "!==")
  )
    return false;
  if (test.right.type !== "Identifier" || test.right.name !== "undefined")
    return false;
  const [empty, filled] =
    test.operator === "===" ? [consequent, alternate] : [alternate, consequent];
  return (
    empty.type === "ObjectExpression" &&
    empty.properties.length === 0 &&
    filled.type === "ObjectExpression" &&
    filled.properties.some(
      (p) => p.type === "ObjectProperty" && sameReference(p.value, test.left),
    )
  );
}

function declaresFunction(path: NodePath): boolean {
  if (path.isFunction()) return true;
  let found = false;
  path.traverse({
    Function(inner) {
      found = true;
      inner.stop();
    },
  });
  return found;
}

/**
 * Runs when the module loads, before the runner switches a mutant on, so its mutants survive
 * whatever the tests do (stryker-js#6144). A function declared there runs later and is mutated.
 */
function runsAtImport(path: NodePath): boolean {
  return path.getFunctionParent() === null && !declaresFunction(path);
}

/**
 * Why a node is arid (Google's term, TSE 2021): no useful test catches its mutants. `undefined`
 * mutates it.
 */
export function aridReason(path: NodePath): string | undefined {
  const { node } = path;
  if (runsAtImport(path))
    return "Runs when the module loads, before the mutant is switched on.";
  if (
    isLogCall(node) ||
    (node.type === "ExpressionStatement" && isLogCall(node.expression))
  ) {
    return "A log call: what it records is not behaviour.";
  }
  if (isOptionalSpreadTest(path))
    return "Spreads a key only when defined: absent and undefined read the same.";
  if (isEmptyFallback(path)) return "An empty `??` fallback the types ask for.";
  if (isStringValueOf(path, PROSE_KEYS)) return "Display text a person reads.";
  if (isStringValueOf(path, HINT_KEYS))
    return "A 404's debug hint, not its status.";
  if (isErrorProse(path))
    return "An error's message or details: callers branch on its code.";
  return undefined;
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, "plumix-arid", {
    shouldIgnore: aridReason,
  }),
];
