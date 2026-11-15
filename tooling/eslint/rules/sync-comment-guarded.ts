import { existsSync } from "node:fs";
import * as path from "node:path";
import type { Rule } from "eslint";

import { blockProse, lineAt, startsOwnLine } from "./comment-block.js";
import { groupIntoBlocks } from "./max-comment-length.js";

const COUPLING =
  /\bmirrors\b|\bkeeps?\b(?:[^.]|\.(?!\s|$))*?\bin sync\b|\bkept in sync\b|\bmust match\b|\bmust stay in step\b/i;

/** Vitest's unit, build and browser suites, and Playwright specs. */
const TEST_FILE = /\.(test|spec)\.tsx?$/;

const GUARD = /\bGuarded by:\s*(\S+)/;

/** Lint runs from each package, so a guard path resolves from the repo root. */
function repoRootOf(file: string): string {
  let dir = path.dirname(file);
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(file);
    dir = parent;
  }
  return dir;
}

export const syncCommentGuarded: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a comment that claims a coupling to name the test that guards it.",
    },
    messages: {
      unguarded:
        "This comment claims a coupling nothing checks. Collapse the duplication into one source; or bind it with a test and add `Guarded by: <repo-relative test path>`; or reword it if it is not an invariant.",
      guardMissing:
        "`Guarded by:` names {{guard}}, which does not exist. Give the repo-relative path of the test that binds this coupling.",
      guardNotTest:
        "`Guarded by:` names {{guard}}, which is not a test file (`*.test.ts(x)` or a Playwright `*.spec.ts(x)`). Name the test that fails when the coupling breaks.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const root = repoRootOf(context.filename);
    const report = (line: number, messageId: string, guard = ""): void => {
      context.report({
        loc: {
          start: { line, column: 0 },
          end: { line, column: sourceCode.lines[line - 1]?.length ?? 0 },
        },
        messageId,
        data: { guard },
      });
    };
    return {
      Program() {
        const blocks = groupIntoBlocks(sourceCode.getAllComments(), (comment) =>
          startsOwnLine(sourceCode, comment),
        );
        for (const block of blocks) {
          const prose = blockProse(block);
          const coupling = COUPLING.exec(prose.text);
          if (coupling === null) continue;
          const guard = GUARD.exec(prose.text);
          if (guard === null) {
            report(lineAt(prose.lines, coupling.index), "unguarded");
            continue;
          }
          const guardPath = guard[1]?.replace(/^`|[`.,;:)]+$/g, "") ?? "";
          if (!existsSync(path.join(root, guardPath))) {
            report(lineAt(prose.lines, guard.index), "guardMissing", guardPath);
          } else if (!TEST_FILE.test(guardPath)) {
            report(lineAt(prose.lines, guard.index), "guardNotTest", guardPath);
          }
        }
      },
    };
  },
};
