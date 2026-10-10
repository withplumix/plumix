import type { Rule, Scope } from "eslint";

/**
 * What a test can only do with a DOM in front of it. A Node-tier test that
 * reaches for one of these belongs in the browser tier.
 */
const DOM_MODULES = new Set([
  "@testing-library/react",
  "@testing-library/user-event",
  "@testing-library/dom",
  "vitest/browser",
  "react-dom/client",
]);

const DOM_GLOBALS = new Set([
  "document",
  "window",
  "navigator",
  "localStorage",
  "sessionStorage",
]);

const TIERS =
  "Tests come in two tiers, chosen by filename: `*.test.ts(x)` runs in Node, " +
  "`*.browser.test.ts(x)` runs in Chromium, and neither simulates a DOM " +
  "(ADR 0021).";

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const BROWSER_TEST_FILE = /\.browser\.test\.[cm]?[jt]sx?$/;
const VITEST_CONFIG = /(?:^|[\\/])vitest(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/;

function baseName(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? filename;
}

function isTypeofOperand(node: Rule.Node): boolean {
  const { parent } = node;
  return parent?.type === "UnaryExpression" && parent.operator === "typeof";
}

type PropertyNode = Extract<Rule.Node, { type: "Property" }>;

function propertyName(node: PropertyNode): string | null {
  if (node.computed) return null;
  if (node.key.type === "Identifier") return node.key.name;
  if (node.key.type === "Literal" && typeof node.key.value === "string")
    return node.key.value;
  return null;
}

/**
 * An environment setting would bring a simulated DOM back. A `typeof` probe on
 * a DOM global stays allowed: server code uses it to assert the DOM is absent.
 */
export const testTier: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep each test in the tier its filename names: Node for `*.test.ts(x)`, Chromium for `*.browser.test.ts(x)`.",
    },
    messages: {
      environmentDocblock: `A \`@vitest-environment\` docblock swaps in a simulated DOM. ${TIERS} Drop the docblock, and name the file \`*.browser.test.tsx\` if it needs a DOM.`,
      configEnvironment: `\`test.environment\` swaps the environment for every test in the package. ${TIERS} Drop the setting, and name each DOM test \`*.browser.test.tsx\`.`,
      domInNodeTest: `\`{{ what }}\` needs a DOM, and this file runs in Node. ${TIERS} Rename it to \`{{ fix }}\`, or move the DOM case into a file named that way.`,
    },
    schema: [],
  },
  create(context) {
    const { filename, sourceCode } = context;
    const name = baseName(filename);
    const nodeTierTest = TEST_FILE.test(name) && !BROWSER_TEST_FILE.test(name);
    const fix = name.replace(/\.test\./, ".browser.test.");

    function reportDom(node: Rule.Node, what: string): void {
      context.report({ node, messageId: "domInNodeTest", data: { what, fix } });
    }

    function checkModule(
      node: Rule.Node,
      source: { type: string; value?: unknown } | null,
    ): void {
      if (
        source?.type === "Literal" &&
        typeof source.value === "string" &&
        DOM_MODULES.has(source.value)
      )
        reportDom(node, source.value);
    }

    return {
      Program(program) {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.value.includes("@vitest-environment"))
            context.report({
              loc: comment.loc ?? program.loc ?? { line: 1, column: 0 },
              messageId: "environmentDocblock",
            });
        }
        if (!nodeTierTest) return;
        // A lib global (`document` from lib.dom) resolves to a variable with no
        // declaration under typescript-eslint and to nothing under espree;
        // either way no binding in this file is being read.
        const reads: Scope.Reference[] = (
          sourceCode.scopeManager?.scopes ?? []
        ).flatMap((scope) =>
          scope.references.filter(
            (reference) =>
              DOM_GLOBALS.has(reference.identifier.name) &&
              (reference.resolved === null ||
                reference.resolved.defs.length === 0),
          ),
        );
        for (const reference of reads) {
          const identifier = reference.identifier as Rule.Node;
          if (!isTypeofOperand(identifier))
            reportDom(identifier, reference.identifier.name);
        }
      },
      "MemberExpression[object.name='globalThis']"(node: Rule.Node) {
        if (node.type !== "MemberExpression") return;
        if (!nodeTierTest || node.computed) return;
        if (node.property.type !== "Identifier") return;
        if (!DOM_GLOBALS.has(node.property.name) || isTypeofOperand(node))
          return;
        reportDom(node, `globalThis.${node.property.name}`);
      },
      ImportDeclaration(node) {
        if (nodeTierTest) checkModule(node, node.source);
      },
      ImportExpression(node) {
        if (nodeTierTest) checkModule(node, node.source);
      },
      Property(node) {
        if (!VITEST_CONFIG.test(name) || propertyName(node) !== "environment")
          return;
        const owner = node.parent.parent;
        if (owner?.type === "Property" && propertyName(owner) === "test")
          context.report({ node, messageId: "configEnvironment" });
      },
    };
  },
};
