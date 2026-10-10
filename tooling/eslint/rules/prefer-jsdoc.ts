import type { Rule } from "eslint";

type Comment = ReturnType<
  Rule.RuleContext["sourceCode"]["getAllComments"]
>[number];

const DECLARATIONS = [
  "FunctionDeclaration",
  "ClassDeclaration",
  "VariableDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "TSDeclareFunction",
];
const MEMBERS = [
  "TSPropertySignature",
  "TSMethodSignature",
  "PropertyDefinition",
  "MethodDefinition",
  "TSAbstractPropertyDefinition",
  "TSAbstractMethodDefinition",
  "TSEnumMember",
];
const EXPORTS = new Set(["ExportNamedDeclaration", "ExportDefaultDeclaration"]);
const BODIES = new Set(["BlockStatement", "StaticBlock"]);
const DIRECTIVE =
  /^\s*(eslint[\s-]|@ts-|prettier-ignore|[cv]8\s|istanbul\s|@vite-ignore)/;

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

function isTopLevelDeclaration(node: Rule.Node): boolean {
  const parent = node.parent;
  return (
    parent?.type === "Program" ||
    (parent !== null &&
      EXPORTS.has(parent.type) &&
      parent.parent?.type === "Program")
  );
}

function toJsdoc(prose: readonly string[], indent: string): string {
  if (prose.length === 1) return `/** ${prose[0] ?? ""} */`;
  const lines = prose.map((line) =>
    line === "" ? `${indent} *` : `${indent} * ${line}`,
  );
  return ["/**", ...lines, `${indent} */`].join("\n");
}

export const preferJsdoc: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Require a doc comment, not a line comment, on a declaration or member.",
    },
    messages: {
      preferJsdoc:
        "A comment on a declaration or member belongs in `/** */`, which editors show on hover; a `//` comment shows nowhere at the call site.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    function ownLineBlockAbove(anchor: Rule.Node): Comment[] {
      const before = sourceCode.getCommentsBefore(anchor);
      const block: Comment[] = [];
      let expectedEnd = (anchor.loc?.start.line ?? 0) - 1;
      for (let i = before.length - 1; i >= 0; i--) {
        const comment = before[i];
        if (!comment?.loc || comment.loc.end.line !== expectedEnd) break;
        const lead = sourceCode.lines[comment.loc.start.line - 1]?.slice(
          0,
          comment.loc.start.column,
        );
        if (lead?.trim() !== "") break;
        block.unshift(comment);
        expectedEnd = comment.loc.start.line - 1;
      }
      return block;
    }

    function check(node: Rule.Node): void {
      if (isInBody(node)) return;
      const anchor =
        node.parent && EXPORTS.has(node.parent.type) ? node.parent : node;
      const block = ownLineBlockAbove(anchor);
      const lineComments = block.filter((comment) => comment.type === "Line");
      if (lineComments.length !== block.length) return;
      const prose = lineComments.filter((c) => !DIRECTIVE.test(c.value));
      const directives = lineComments.filter((c) => DIRECTIVE.test(c.value));
      if (prose.some((comment) => comment.value.includes("*/"))) return;
      const first = prose[0];
      const last = block.at(-1);
      if (!first?.range || !first.loc || !last?.range) return;
      const start = first.range[0];
      const end = last.range[1];
      if (directives.some((d) => (d.range?.[0] ?? 0) < start)) return;

      const indent = " ".repeat(first.loc.start.column);
      const text = prose.map((comment) =>
        comment.value.replace(/^ /, "").trimEnd(),
      );
      const replacement = [
        toJsdoc(text, indent),
        ...directives.map((d) => `${indent}//${d.value}`),
      ].join("\n");
      context.report({
        loc: first.loc,
        messageId: "preferJsdoc",
        fix: (fixer) => fixer.replaceTextRange([start, end], replacement),
      });
    }

    const listeners: Rule.RuleListener = {};
    for (const type of DECLARATIONS) {
      listeners[type] = (node: Rule.Node) => {
        if (isTopLevelDeclaration(node)) check(node);
      };
    }
    for (const type of MEMBERS) listeners[type] = check;
    return listeners;
  },
};
