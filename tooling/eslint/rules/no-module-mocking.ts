import type { Rule } from "eslint";

/**
 * Jest-only spellings are absent: a rule guarding a runner nobody uses can't
 * be kept honest.
 */
const MOCKING_HELPERS = new Set([
  "mock",
  "doMock",
  "unmock",
  "doUnmock",
  "importActual",
  "importMock",
]);

/**
 * Mocking a module path asserts where code lives, not what it does: move the
 * file and the test passes while covering nothing.
 */
export const noModuleMocking: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow module mocking in tests; substitute at a real seam instead.",
    },
    messages: {
      noModuleMocking:
        "`vi.{{ helper }}` couples this test to where a module lives rather than to what it does. Substitute at a real seam — inject the dependency, stub the platform boundary (`vi.stubGlobal`), or render the real collaborator — and introduce a seam in the source if none exists (issue #1815).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.object.type !== "Identifier" ||
          callee.property.type !== "Identifier" ||
          callee.object.name !== "vi" ||
          !MOCKING_HELPERS.has(callee.property.name)
        ) {
          return;
        }
        context.report({
          node,
          messageId: "noModuleMocking",
          data: { helper: callee.property.name },
        });
      },
    };
  },
};
