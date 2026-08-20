import type { Rule } from "eslint";

/**
 * `Reflect.get` reads a property without the compiler checking that it
 * exists, erasing the result to `any`. On a value we have a type for the read
 * is a plain member access; on a value we don't, it is a parse.
 */
export const noReflectGet: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow `Reflect.get`, which bypasses property typing.",
    },
    messages: {
      noReflectGet:
        "`Reflect.get` reads a property the compiler never checks and hands back `any`. Access it directly (`value.key`), or decode the value with a valibot schema if its shape isn't known yet (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    return {
      "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.object.name='Reflect'][callee.property.name='get']"(
        node: Rule.Node,
      ) {
        context.report({ node, messageId: "noReflectGet" });
      },
    };
  },
};
