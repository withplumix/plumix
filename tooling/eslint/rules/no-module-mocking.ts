import type { Rule } from "eslint";

// Vitest's module-registry helpers, in full. Every one of them takes a module
// path; none of them can be pointed at a value. Jest's extra spellings
// (`setMock`, `requireActual`) are deliberately absent — this repo runs vitest,
// and a rule that guards against a runner nobody uses can't be kept honest.
const MOCKING_HELPERS = new Set([
  "mock",
  "doMock",
  "unmock",
  "doUnmock",
  "importActual",
  "importMock",
]);

/**
 * A test that mocks a module path asserts where code lives, not what it does:
 * move the file and the test keeps passing while covering nothing. Matching is
 * on the `vi.` receiver, so `vi.fn`, `vi.spyOn` and `vi.stubGlobal` —
 * substitutions at a real seam — are untouched, as is a `mock` method on any
 * other object.
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
