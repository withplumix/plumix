import type { Rule } from "eslint";

/**
 * Reads of the current time go through `now()`, so a test site's clock can
 * move them. The clock itself is the one place real time is read.
 */
export const noBareDate: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `Date.now()` and argument-less `new Date()`, which read real time past the site's clock.",
    },
    messages: {
      bareDate:
        "Read the current time through `now()` from `plumix/support` (`@plumix/core/support` inside the framework), so a test site's `travel` and `freezeTime` move it (issue #3444).",
    },
    schema: [],
  },
  create(context) {
    const report = (node: Rule.Node): void => {
      context.report({ node, messageId: "bareDate" });
    };
    return {
      "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.object.name='Date'][callee.property.name='now']":
        report,
      "NewExpression[callee.name='Date'][arguments.length=0]": report,
    };
  },
};
