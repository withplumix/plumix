import type { Rule } from "eslint";

/**
 * `Reflect.apply` calls a function past its signature: the argument tuple is
 * checked against `any[]` and the return type is erased.
 */
export const noReflectApply: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow `Reflect.apply`, which bypasses call signatures.",
    },
    messages: {
      noReflectApply:
        "`Reflect.apply` calls a function past its signature — arguments go unchecked and the return type is erased. Call it directly (`fn(...args)`), or bind the receiver with `fn.call(thisArg, ...args)` (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    return {
      "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.object.name='Reflect'][callee.property.name='apply']"(
        node: Rule.Node,
      ) {
        context.report({ node, messageId: "noReflectApply" });
      },
    };
  },
};
