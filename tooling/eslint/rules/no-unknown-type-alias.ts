import type { Rule } from "eslint";

/**
 * Aliasing `unknown` makes every call site read as deliberate design. Inside
 * a wider type it describes a boundary instead of hiding one.
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
