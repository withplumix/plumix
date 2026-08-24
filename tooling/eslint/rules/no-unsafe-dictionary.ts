import type { Rule } from "eslint";

import { commentBlockAbove, wordsAfterMarker } from "./comment-block.js";

// The convention #1819 settled on for a dictionary that is deliberately not
// serialized data. Sentence-initial, greppable, one clause. `Not JsonObject`
// is the second half of the same token: a bag that really is serialized data
// but has no proof of it yet says so in the same breath, rather than borrowing
// a claim ("not JSON") that would be false.
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

// Safety: ESLint's node types stop at ESTree, so the TypeScript-only fields
// this rule reads have no declaration to narrow to. Every field on `TypeNode`
// is optional, so a shape that does not match reads as absent.
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

// Nothing here declares a bag. A constraint or default bounds a type the
// *caller* supplies; a guard's whole job is to establish "an object with string
// keys"; an assertion target is `no-chained-type-assertion`'s business; and a
// local's contract is the initializer beside it.
const DECLARES_NOTHING = new Set([
  "TSTypeParameter",
  "TSTypePredicate",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "VariableDeclarator",
]);

// A signature or a member is a contract in its own right, whatever encloses it.
// Reaching one first is what stops an alias from covering the bags nested
// inside it — `type T = { meta: Record<string, unknown> }` gets no more slack
// than the `interface` spelling of the same thing, and a function assigned to a
// const gets none from the declarator further out.
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
 * Where this dictionary sits, walking outward to the first ancestor that
 * decides the question. Everything the walk passes through on the way —
 * `Readonly<…>`, a union, an array, a type argument — leaves the answer
 * unchanged, which is why it continues rather than reporting at depth 1.
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
 * `Record<string, unknown>` is how both "JSON I have not parsed yet" and "an
 * open bag of anything" get spelled, and a linter cannot tell them apart. What
 * it can insist on is that the two stop sharing a spelling: JSON is
 * `JsonObject`, and an open bag is a *named* type whose declaration says what
 * fills it and why it is not serialized data (issue #1820).
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
