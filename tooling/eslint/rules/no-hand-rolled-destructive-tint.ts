import type { Rule } from "eslint";

// The two inline destructive tints live in `@plumix/admin-ui/destructive`.
// Spelled out by hand they drift — #2477 found eight copies, and the editor's
// row removes had gone always-red while the admin's stayed muted. Ghost is
// checked first: a string carrying `text-destructive` is always red whatever
// else it holds.
const TINTS = [
  {
    exportName: "destructiveGhostClassName",
    tokens: ["text-destructive", "hover:text-destructive"],
  },
  {
    exportName: "destructiveRowClassName",
    tokens: ["text-muted-foreground", "hover:text-destructive"],
  },
] as const;

function tintIn(classes: string): string | undefined {
  const present = new Set(classes.split(/\s+/));
  return TINTS.find((tint) => tint.tokens.every((token) => present.has(token)))
    ?.exportName;
}

/**
 * Scoped to strings inside a `className` attribute, so the declaration module
 * — which holds the tints as plain constants — stays silent without an
 * exception.
 */
export const noHandRolledDestructiveTint: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow spelling out a shared destructive tint inside `className`.",
    },
    messages: {
      handRolledTint:
        "Hand-rolled destructive tint — import `{{exportName}}` from `@plumix/admin-ui/destructive` (or `plumix/admin/ui` in a plugin) and compose it with `cn`, so the surfaces can't drift (issue #2477).",
    },
    schema: [],
  },
  create(context) {
    const check = (node: Rule.Node, classes: string) => {
      const exportName = tintIn(classes);
      if (exportName) {
        context.report({
          node,
          messageId: "handRolledTint",
          data: { exportName },
        });
      }
    };
    return {
      "JSXAttribute[name.name='className'] Literal"(node: Rule.Node) {
        if (node.type === "Literal" && typeof node.value === "string") {
          check(node, node.value);
        }
      },
      "JSXAttribute[name.name='className'] TemplateElement"(node: Rule.Node) {
        if (node.type === "TemplateElement") {
          check(node, node.value.cooked ?? node.value.raw);
        }
      },
    };
  },
};
