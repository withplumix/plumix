import type { Rule } from "eslint";

/**
 * A named type is a promise of meaning. Aliasing `unknown` breaks the promise
 * while making every call site read as deliberate design. `unknown` inside a
 * wider type (`Record<string, unknown>`, `(input: unknown) => T`) is
 * untouched — those describe a boundary rather than hide one.
 */
export const noUnknownTypeAlias: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow a type alias whose definition is `unknown`.",
    },
    messages: {
      noUnknownTypeAlias:
        "A type alias defined as `unknown` names nothing the compiler can use. Describe the shape, or spell `unknown` inline at the parse boundary where the value is decoded (issue #1807).",
    },
    schema: [],
  },
  create(context) {
    return {
      "TSTypeAliasDeclaration[typeAnnotation.type='TSUnknownKeyword']"(
        node: Rule.Node,
      ) {
        context.report({ node, messageId: "noUnknownTypeAlias" });
      },
    };
  },
};
