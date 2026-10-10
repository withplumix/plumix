import type { Rule } from "eslint";

/**
 * Testing-library's `get`/`query`/`find` families and Playwright's locator
 * getters, minus the test-id member of each. `Label` and `Placeholder`
 * without the `Text` suffix are Playwright's spelling of the same queries.
 */
const QUERY_NAME_PATTERN =
  /^(get|query|find)(All)?By(Role|Text|Label(Text)?|Placeholder(Text)?|AltText|Title|DisplayValue)$/;

/**
 * `estree` isn't a direct dependency here, so the node type is read back off
 * the listener that receives it.
 */
type CallExpressionNode = Parameters<
  NonNullable<Rule.NodeListener["CallExpression"]>
>[0];

/**
 * `screen.getByRole(...)` and a destructured `getByRole(...)` are the two
 * shapes tests write; an aliased or dynamically indexed query is neither.
 */
function calleeName({ callee }: CallExpressionNode): string | undefined {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
}

/**
 * Matched by name alone, so a domain `findByRole` reports too; disable it on
 * that line rather than guess the receiver.
 */
export const noNonTestidQueries: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow role, text, label, placeholder, alt-text, title and display-value queries in tests and e2e specs.",
    },
    messages: {
      noNonTestidQueries:
        "`{{ name }}` binds this test to markup the component may change for unrelated reasons. Query by test id — `getByTestId` in a unit test, `page.getByTestId` or a `[data-testid=…]` locator in an e2e spec — and add a `data-testid` to the markup if none exists (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node);
        if (name === undefined || !QUERY_NAME_PATTERN.test(name)) {
          return;
        }
        context.report({
          node,
          messageId: "noNonTestidQueries",
          data: { name },
        });
      },
    };
  },
};
