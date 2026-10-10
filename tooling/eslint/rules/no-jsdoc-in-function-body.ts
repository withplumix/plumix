import type { Rule } from "eslint";

type Comment = ReturnType<
  Rule.RuleContext["sourceCode"]["getAllComments"]
>[number];

const BODIES = new Set(["BlockStatement", "StaticBlock"]);

function isJsdoc(comment: Comment): boolean {
  return comment.type === "Block" && comment.value.startsWith("*");
}

function isInBody(node: Rule.Node): boolean {
  for (
    let current: Rule.Node | null = node;
    current;
    current = current.parent
  ) {
    if (BODIES.has(current.type)) return true;
  }
  return false;
}

export const noJsdocInFunctionBody: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow a doc comment inside a function body.",
    },
    messages: {
      jsdocInBody:
        "A `/** */` block documents a declaration or member for editor hovers; nothing hovers a local. Let the name carry it, or keep a short `//` comment for a reason the code can't state.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const handled = new Set<Comment>();
    return {
      "*"(node: Rule.Node) {
        if (node.type === "Program") return;
        for (const comment of sourceCode.getCommentsBefore(node)) {
          if (!isJsdoc(comment) || handled.has(comment)) continue;
          handled.add(comment);
          if (!isInBody(node)) continue;
          context.report({
            loc: comment.loc ?? node.loc ?? { line: 1, column: 0 },
            messageId: "jsdocInBody",
          });
        }
      },
    };
  },
};
