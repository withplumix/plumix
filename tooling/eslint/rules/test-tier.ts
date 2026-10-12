import type { Rule, Scope } from "eslint";

/**
 * What a test can only do with a DOM in front of it. A unit test that reaches
 * for one of these is testing browser behaviour, which e2e owns.
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
  "A unit test checks logic in Node and simulates no DOM; browser behaviour is " +
  "tested by the package's `e2e/` suite (CODING_STANDARDS.md#tests, ADR 0042).";

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const BROWSER_TEST_FILE = /\.browser\.test\.[cm]?[jt]sx?$/;
const BUILD_TEST_FILE = /\.build\.test\.[cm]?[jt]sx?$/;
const PROCESS_MODULES = new Set(["node:child_process", "child_process"]);
const SKIPPING = new Set(["skip", "fixme"]);
const TEST_FUNCTIONS = new Set(["test", "it", "describe"]);
const ISSUE_NUMBER = /#\d+/;

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
        "Keep unit tests on logic in Node (no simulated DOM, no DOM APIs, no child process), keep retries out of Vitest, give every skip an issue, and add no file to a retired tier.",
    },
    messages: {
      environmentDocblock: `A \`@vitest-environment\` docblock swaps in a simulated DOM. ${TIERS} Drop the docblock.`,
      configEnvironment: `\`test.environment\` swaps the environment for every test in the package. ${TIERS} Drop the setting.`,
      retiredTier: `\`*.browser.test.*\` and \`*.build.test.ts\` are retired tiers. ${TIERS} Test the logic in a \`*.test.ts\` file, what the user sees in \`e2e/\`, and what an installed project does in the scaffold smoke.`,
      unexplainedSkip: `A \`skip\` or \`fixme\` names the issue that re-enables it, \`#1234\` in its title (CODING_STANDARDS.md#tests). Add the issue number, delete the test if the behaviour is gone, or use \`test.skipIf\` with the capability a platform lacks.`,
      configRetry: `\`test.retry\` hides a flaky unit test. A flaky test is a bug: drop the setting and fix the test (CODING_STANDARDS.md#tests).`,
      processInUnitTest: `A unit test stays in one process. ${TIERS} Call the command's function in-process, and run the installed binary in the scaffold smoke.`,
      domInNodeTest: `\`{{ what }}\` needs a DOM, and this file runs in Node. ${TIERS} Move the logic into a function this test can call, and cover what the user sees in \`e2e/\`.`,
    },
    schema: [
      {
        type: "object",
        properties: {
          pending: { type: "array", items: { type: "string" } },
          processSubjects: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const { filename, sourceCode } = context;
    const { pending = [], processSubjects = [] } =
      (context.options[0] as
        | { pending?: readonly string[]; processSubjects?: readonly string[] }
        | undefined) ?? {};
    const name = baseName(filename);
    const nodeTierTest = TEST_FILE.test(name) && !BROWSER_TEST_FILE.test(name);

    function reportDom(node: Rule.Node, what: string): void {
      context.report({ node, messageId: "domInNodeTest", data: { what } });
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

    const path = filename.split(/[\\/]/).join("/");
    const listed = (entries: readonly string[]): boolean =>
      entries.some((entry) => path.endsWith(`/${entry}`));
    const retired =
      (BROWSER_TEST_FILE.test(name) || BUILD_TEST_FILE.test(name)) &&
      !listed(pending);
    const processBanned =
      nodeTierTest &&
      !BUILD_TEST_FILE.test(name) &&
      !listed(pending) &&
      !listed(processSubjects);

    function checkProcessModule(
      node: Rule.Node,
      source: { type: string; value?: unknown } | null,
    ): void {
      if (
        processBanned &&
        source?.type === "Literal" &&
        typeof source.value === "string" &&
        PROCESS_MODULES.has(source.value)
      )
        context.report({ node, messageId: "processInUnitTest" });
    }

    return {
      Program(program) {
        if (retired)
          context.report({
            loc: { line: 1, column: 0 },
            messageId: "retiredTier",
          });
        for (const comment of sourceCode.getAllComments()) {
          if (comment.value.includes("@vitest-environment"))
            context.report({
              loc: comment.loc ?? program.loc,
              messageId: "environmentDocblock",
            });
        }
        if (!nodeTierTest) return;
        // A lib global (`document` from lib.dom) resolves to a variable with no
        // declaration under typescript-eslint and to nothing under espree;
        // either way no binding in this file is being read.
        const reads: Scope.Reference[] = sourceCode.scopeManager.scopes.flatMap(
          (scope) =>
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
        checkProcessModule(node, node.source);
      },
      ImportExpression(node) {
        if (nodeTierTest) checkModule(node, node.source);
        checkProcessModule(node, node.source);
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          !SKIPPING.has(callee.property.name)
        )
          return;
        const { object } = callee;
        const testFunction =
          (object.type === "Identifier" && TEST_FUNCTIONS.has(object.name)) ||
          (object.type === "MemberExpression" &&
            !object.computed &&
            object.object.type === "Identifier" &&
            object.object.name === "test" &&
            object.property.type === "Identifier" &&
            object.property.name === "describe");
        if (!testFunction) return;
        if (node.arguments.length === 0) {
          context.report({ node, messageId: "unexplainedSkip" });
          return;
        }
        const [title] = node.arguments;
        const text =
          title?.type === "Literal" && typeof title.value === "string"
            ? title.value
            : title?.type === "TemplateLiteral" &&
                title.expressions.length === 0
              ? title.quasis.map((quasi) => quasi.value.cooked ?? "").join("")
              : undefined;
        if (text !== undefined && !ISSUE_NUMBER.test(text))
          context.report({ node, messageId: "unexplainedSkip" });
      },
      Property(node) {
        if (!VITEST_CONFIG.test(name)) return;
        const key = propertyName(node);
        if (key !== "environment" && key !== "retry") return;
        const owner = node.parent.parent;
        if (owner?.type === "Property" && propertyName(owner) === "test")
          context.report({
            node,
            messageId: key === "retry" ? "configRetry" : "configEnvironment",
          });
      },
    };
  },
};
