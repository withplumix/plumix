import type { Rule, Scope } from "eslint";

const WRITES = new Set(["insert", "update", "delete"]);

/**
 * Core's write functions purge the CDN, fire the lifecycle actions and run
 * the meta pipeline; a direct write to a core table skips all three.
 */
export const noCoreTableWrite: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `insert`, `update` and `delete` on a table imported from `plumix/schema`.",
    },
    messages: {
      coreTableWrite:
        "Write core's tables through `ctx.entries`, `ctx.terms` or `ctx.settings.write`, which purge the pages that read the row, fire the lifecycle actions and run the meta pipeline. A direct `{{method}}` leaves cached pages stale.",
    },
    schema: [],
  },
  create(context) {
    const reportWrite = (table: Rule.Node): void => {
      const call = table.parent;
      if (call?.type !== "CallExpression" || call.arguments[0] !== table) {
        return;
      }
      const { callee } = call;
      if (callee.type !== "MemberExpression" || callee.computed) return;
      if (callee.property.type !== "Identifier") return;
      if (!WRITES.has(callee.property.name)) return;
      context.report({
        node: call,
        messageId: "coreTableWrite",
        data: { method: callee.property.name },
      });
    };
    const checkReference = (reference: Scope.Reference): void => {
      const identifier = reference.identifier as Rule.Node;
      const { parent } = identifier;
      const namespaced =
        parent?.type === "MemberExpression" && parent.object === identifier;
      reportWrite(namespaced ? parent : identifier);
    };
    return {
      ImportDeclaration(node) {
        if (node.source.value !== "plumix/schema") return;
        for (const variable of context.sourceCode.getDeclaredVariables(node)) {
          variable.references.forEach(checkReference);
        }
      },
    };
  },
};
