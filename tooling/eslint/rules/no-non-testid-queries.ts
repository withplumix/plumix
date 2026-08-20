import type { Rule } from "eslint";

// Testing-library's `get`/`query`/`find` families and Playwright's locator
// getters, minus the test-id member of each. `Label` and `Placeholder`
// without the `Text` suffix are Playwright's spelling of the same queries.
const QUERY_NAME_PATTERN =
  /^(get|query|find)(All)?By(Role|Text|Label(Text)?|Placeholder(Text)?|AltText|Title|DisplayValue)$/;

// `estree` isn't a direct dependency here, so the node type is read back off
// the listener that receives it.
type CallExpressionNode = Parameters<
  NonNullable<Rule.NodeListener["CallExpression"]>
>[0];

// `screen.getByRole(...)` and a destructured `getByRole(...)` are the two
// shapes tests write; an aliased or dynamically indexed query is neither.
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
 * A query by role, text or label reads the markup a component happens to
 * render today, so a copy edit or a changed heading level breaks a test that
 * has nothing to do with either. A test id is the one selector the markup
 * owes the test.
 *
 * Matching is by name alone, so a domain call that happens to share one —
 * `userRepo.findByRole("admin")` in a test — reports too. There are none in
 * the repo today; if one appears, disable the rule on that line rather than
 * narrowing the match to a receiver the rule can't reliably identify.
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
        "`{{ name }}` binds this test to markup the component may change for unrelated reasons. Query by test id — `getByTestId` in a unit test, `page.getByTestId` or a `[data-testid=…]` locator in an e2e spec — and add a `data-testid` to the markup if none exists (AGENTS.md, issue #1807).",
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
