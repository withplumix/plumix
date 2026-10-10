import type { Rule } from "eslint";

type Comment = ReturnType<
  Rule.RuleContext["sourceCode"]["getAllComments"]
>[number];

const EXPORTING = new Set([
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "TSModuleDeclaration",
  "TSExportAssignment",
]);
const BODIES = new Set(["BlockStatement", "StaticBlock"]);

function isJsdoc(comment: Comment): boolean {
  return comment.type === "Block" && comment.value.startsWith("*");
}

type Program = Parameters<NonNullable<Rule.RuleListener["Program"]>>[0];

function exportedNames(program: Program): Set<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration" && !statement.source) {
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === "Identifier")
          names.add(specifier.local.name);
      }
    }
    if (
      statement.type === "ExportDefaultDeclaration" &&
      statement.declaration.type === "Identifier"
    ) {
      names.add(statement.declaration.name);
    }
  }
  return names;
}

export const noInternalJsdoc: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow a doc comment on a declaration the module does not export.",
    },
    messages: {
      internalJsdoc:
        "A `/** */` block documents a published contract. On internal code, let the names carry it, or keep a short `//` comment for a reason the code can't state.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const handled = new Set<Comment>();
    let exported = new Set<string>();

    function isPublic(node: Rule.Node): boolean {
      let current = node;
      while (current.parent && current.parent.type !== "Program") {
        if (BODIES.has(current.parent.type)) return false;
        current = current.parent;
      }
      if (BODIES.has(node.type)) return false;
      if (EXPORTING.has(current.type)) return true;
      return sourceCode
        .getDeclaredVariables(current)
        .some((variable) => exported.has(variable.name));
    }

    return {
      Program(program) {
        exported = exportedNames(program);
      },
      "*"(node: Rule.Node) {
        if (node.type === "Program") return;
        for (const comment of sourceCode.getCommentsBefore(node)) {
          if (!isJsdoc(comment) || handled.has(comment)) continue;
          handled.add(comment);
          if (isPublic(node)) continue;
          context.report({
            loc: comment.loc ?? node.loc ?? { line: 1, column: 0 },
            messageId: "internalJsdoc",
          });
        }
      },
    };
  },
};
