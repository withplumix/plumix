import type { Rule } from "eslint";

/**
 * `React.lazy` already loads its module once, so a component's lazy import
 * needs no second memo.
 */
const LOADERS = new Set(["loadOnce", "lazy"]);

/**
 * `estree` isn't a direct dependency here, so the node type is read back off
 * the listener that receives it.
 */
type CallExpressionNode = Parameters<
  NonNullable<Rule.NodeListener["CallExpression"]>
>[0];

function loaderName({ callee }: CallExpressionNode): string | undefined {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "React" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
}

/**
 * The nearest enclosing function must be the factory itself: one nested inside
 * it runs per call again.
 */
function insideLoader(node: Rule.Node): boolean {
  let fn: Rule.Node | null = node.parent;
  while (
    fn !== null &&
    fn.type !== "ArrowFunctionExpression" &&
    fn.type !== "FunctionExpression" &&
    fn.type !== "FunctionDeclaration"
  ) {
    fn = fn.parent;
  }
  if (fn === null || fn.type === "FunctionDeclaration") return false;
  const call = fn.parent;
  if (call.type !== "CallExpression" || !call.arguments.includes(fn)) {
    return false;
  }
  const name = loaderName(call);
  return name !== undefined && LOADERS.has(name);
}

export const dynamicImportInLoadOnce: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every dynamic `import()` to sit in a `loadOnce` factory.",
    },
    messages: {
      outsideLoadOnce:
        "Load this module through `loadOnce(() => import(…))` from `plumix/support`, so every caller in the isolate awaits one fully evaluated module and a failed load is retried.",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportExpression(node: Rule.Node) {
        if (!insideLoader(node)) {
          context.report({ node, messageId: "outsideLoadOnce" });
        }
      },
    };
  },
};
