import type { Rule } from "eslint";

import { commentBlockAbove, wordsAfterMarker } from "./comment-block.js";

/**
 * `Not JsonObject` lets a bag that is serialized data without proof yet say so,
 * rather than borrow a false "not JSON".
 */
const NOT_JSON_MARKER = /(^|\s)not\s+`?json(object)?\b/i;
const MIN_REASON_WORDS = 6;

interface TypeNode {
  readonly type: string;
  readonly parent?: TypeNode;
  readonly members?: readonly unknown[];
  readonly loc?: { readonly start: { readonly line: number } };
  readonly typeName?: { readonly name?: string };
  readonly typeArguments?: { readonly params?: readonly TypeNode[] };
  readonly typeAnnotation?: TypeNode;
}

/**
 * Safety: ESLint's node types stop at ESTree, and every `TypeNode` field is
 * optional, so a shape that does not match reads as absent.
 */
const asTypeNode = (node: Rule.Node): TypeNode => node as unknown as TypeNode;

/** The value spelling this dictionary is over, or null when the value names a type. */
function dictionaryValue(
  node: TypeNode | undefined,
): "unknown" | "any" | "object" | "{}" | null {
  switch (node?.type) {
    case "TSUnknownKeyword":
      return "unknown";
    case "TSAnyKeyword":
      return "any";
    case "TSObjectKeyword":
      return "object";
    case "TSTypeLiteral":
      return node.members?.length === 0 ? "{}" : null;
    default:
      return null;
  }
}

/**
 * A constraint bounds a type the caller supplies, a guard establishes string
 * keys, and a local's contract is its initializer.
 */
const DECLARES_NOTHING = new Set([
  "TSTypeParameter",
  "TSTypePredicate",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "VariableDeclarator",
]);

/**
 * Stopping at these keeps an alias from covering bags nested inside it, so
 * `type T = { meta: … }` gets no more slack than an `interface`.
 */
const DECLARES_A_CONTRACT = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "PropertyDefinition",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "TSConstructorType",
  "TSDeclareFunction",
  "TSFunctionType",
  "TSIndexSignature",
  "TSMethodSignature",
  "TSPropertySignature",
]);

type Position =
  | { readonly kind: "exempt" }
  | { readonly kind: "inline" }
  | { readonly kind: "named"; readonly declaration: TypeNode };

/**
 * `Readonly<…>`, a union, an array or a type argument leaves the answer
 * unchanged, so the walk continues past them.
 */
function positionOf(node: TypeNode): Position {
  let parent = node.parent;
  while (parent) {
    if (DECLARES_NOTHING.has(parent.type)) return { kind: "exempt" };
    if (DECLARES_A_CONTRACT.has(parent.type)) return { kind: "inline" };
    if (parent.type === "TSTypeAliasDeclaration") {
      return { kind: "named", declaration: parent };
    }
    parent = parent.parent;
  }
  return { kind: "inline" };
}

/**
 * `Record<string, unknown>` spells both unparsed JSON and an open bag, which a
 * linter can't tell apart, so each gets its own spelling.
 */
export const noUnsafeDictionary: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a dictionary over `unknown`/`any`/`object`/`{}` outside a named declaration that explains it.",
    },
    messages: {
      undescribedDictionaryValue:
        "A dictionary over `{{ value }}` waives type checking on every value it holds rather than deferring it, so no declaration can keep it. Spell it `JsonObject` if it carries serialized data, `Record<string, T>` if the values share a type, or `Record<string, unknown>` at a named declaration if the bag really is open (issue #1820).",
      inlineUnknownDictionary:
        "`Record<string, unknown>` spelled inline reads the same whether it is JSON nobody has parsed or a bag that is open by design. Use `JsonObject` if it carries serialized data; otherwise move it to a named type whose declaration states what fills the bag and why it is not JSON (issue #1820).",
      namedDictionaryReasonMissing:
        "A named open dictionary has to say why it is not JSON — the note is what makes `JsonObject` the obvious default everywhere else. Write a `Not JSON: …` sentence in the comment directly above this declaration (issue #1820).",
      namedDictionaryReasonTooThin:
        "A `Not JSON:` note has to give the reason, not merely mark the declaration — name what puts a non-serializable value in this bag (issue #1820).",
    },
    schema: [],
  },
  create(context) {
    const check = (
      node: Rule.Node,
      valueNode: TypeNode | undefined,
      position: Position,
    ): void => {
      const value = dictionaryValue(valueNode);
      if (value === null) return;
      if (value !== "unknown") {
        context.report({
          node,
          messageId: "undescribedDictionaryValue",
          data: { value },
        });
        return;
      }
      if (position.kind === "exempt") return;
      if (position.kind === "inline") {
        context.report({ node, messageId: "inlineUnknownDictionary" });
        return;
      }
      // Anchored on the declaration rather than on the `Record<…>` inside it,
      // so an alias that wraps or breaks across lines still finds its note.
      const words = wordsAfterMarker(
        commentBlockAbove(
          context.sourceCode,
          position.declaration.loc?.start.line ?? 0,
        ),
        NOT_JSON_MARKER,
      );
      if (words === null) {
        context.report({ node, messageId: "namedDictionaryReasonMissing" });
      } else if (words < MIN_REASON_WORDS) {
        context.report({ node, messageId: "namedDictionaryReasonTooThin" });
      }
    };

    return {
      "TSTypeReference[typeName.name='Record']"(node: Rule.Node) {
        const self = asTypeNode(node);
        const params = self.typeArguments?.params;
        if (params?.length !== 2) return;
        check(node, params[1], positionOf(self));
      },
      TSIndexSignature(node: Rule.Node) {
        const self = asTypeNode(node);
        // An index signature on an interface is already a named bag — the
        // interface is the name. Nested in an inline type literal it is not.
        const position: Position =
          self.parent?.type === "TSInterfaceBody"
            ? { kind: "named", declaration: self }
            : positionOf(self);
        check(node, self.typeAnnotation?.typeAnnotation, position);
      },
    };
  },
};
