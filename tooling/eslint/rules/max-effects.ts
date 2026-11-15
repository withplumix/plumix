import type { Rule } from "eslint";

/**
 * `useLayoutEffect` and `useInsertionEffect` are counted with `useEffect`: the
 * misuse is the same, and a swap to one of them would otherwise pass the cap.
 */
const EFFECT_HOOK = /^use(?:Layout|Insertion)?Effect$/;

/** `useEffect` or `React.useEffect`: the name a call reaches the hook by. */
function calledName({
  callee,
}: Rule.Node & { type: "CallExpression" }): string | undefined {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
}

/** Reports a file's effect calls past `max`, once, at the first one over. */
export const maxEffects: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Cap the number of React effect hooks called in a file.",
    },
    messages: {
      tooManyEffects:
        "File has {{count}} effect hook calls (useEffect, useLayoutEffect, useInsertionEffect); the most allowed here is {{max}}. An effect is for syncing with something outside React, such as the DOM, a timer or a subscription. Derive a value during render, handle an event in its handler, and fetch through TanStack Query instead (https://react.dev/learn/you-might-not-need-an-effect, CODING_STANDARDS.md#correctness, issue #3713).",
    },
    schema: [
      {
        type: "object",
        properties: { max: { type: "integer", minimum: 0 } },
        required: ["max"],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const { max } = context.options[0] as { max: number };
    const calls: Rule.Node[] = [];
    return {
      CallExpression(node) {
        const name = calledName(node);
        if (name !== undefined && EFFECT_HOOK.test(name)) calls.push(node);
      },
      "Program:exit"() {
        const firstOver = calls[max];
        if (firstOver === undefined) return;
        context.report({
          node: firstOver,
          messageId: "tooManyEffects",
          data: { count: String(calls.length), max: String(max) },
        });
      },
    };
  },
};
