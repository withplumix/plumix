import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import * as path from "node:path";
import type { Rule } from "eslint";

import { groupIntoBlocks } from "./max-comment-length.js";

type Comment = ReturnType<
  Rule.RuleContext["sourceCode"]["getAllComments"]
>[number];

const COUPLING =
  /\bmirrors\b|\bkeeps?\b(?:[^.]|\.(?!\s|$))*?\bin sync\b|\bkept in sync\b|\bmust match\b|\bmust stay in step\b/i;

/** A coupling comment the rule skips, identified by its file and line hash. */
export interface BaselineEntry {
  readonly file: string;
  readonly hash: string;
}

/**
 * Keyed by the line's text, not its number, so an edit elsewhere in the file
 * leaves the entry matching.
 */
export function lineHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

/** Vitest's unit, build and browser suites, and Playwright specs. */
const TEST_FILE = /\.(test|spec)\.tsx?$/;

const GUARD = /\bGuarded by:\s*(\S+)/;

interface ProseLine {
  readonly line: number;
  readonly start: number;
}

/**
 * Joins a block's lines into one string, so a phrase wrapped onto the next
 * line still matches, and keeps where each line starts to map a match back.
 */
function blockProse(block: readonly Comment[]): {
  text: string;
  lines: ProseLine[];
} {
  const parts: string[] = [];
  const lines: ProseLine[] = [];
  let offset = 0;
  for (const comment of block) {
    const first = comment.loc?.start.line ?? 0;
    comment.value.split("\n").forEach((raw, index) => {
      const text = raw.replace(/^[\s*]+/, "");
      lines.push({ line: first + index, start: offset });
      parts.push(text);
      offset += text.length + 1;
    });
  }
  return { text: parts.join(" "), lines };
}

/** Lint runs from each package, so a guard path resolves from the repo root. */
export function repoRootOf(file: string): string {
  let dir = path.dirname(file);
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(file);
    dir = parent;
  }
  return dir;
}

function lineAt(lines: readonly ProseLine[], index: number): number {
  return lines.filter((line) => line.start <= index).at(-1)?.line ?? 0;
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
    schema: [
      {
        type: "object",
        properties: {
          baseline: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                hash: { type: "string" },
              },
              required: ["file", "hash"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const { sourceCode } = context;
    const startsOwnLine = (comment: Comment): boolean => {
      const line = comment.loc?.start.line ?? 0;
      const column = comment.loc?.start.column ?? 0;
      return sourceCode.lines[line - 1]?.slice(0, column).trim() === "";
    };
    const root = repoRootOf(context.filename);
    const file = path
      .relative(root, context.filename)
      .split(path.sep)
      .join("/");
    const options = context.options[0] as
      { baseline?: readonly BaselineEntry[] } | undefined;
    // Counted, so a verbatim copy of a baselined line is held to the rule.
    const baselined = new Map<string, number>();
    for (const entry of options?.baseline ?? []) {
      if (entry.file !== file) continue;
      baselined.set(entry.hash, (baselined.get(entry.hash) ?? 0) + 1);
    }
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
        const comments = sourceCode.getAllComments();
        for (const block of groupIntoBlocks(comments, startsOwnLine)) {
          const prose = blockProse(block);
          const coupling = COUPLING.exec(prose.text);
          if (coupling === null) continue;
          const guard = GUARD.exec(prose.text);
          if (guard === null) {
            const line = lineAt(prose.lines, coupling.index);
            const text = sourceCode.lines[line - 1] ?? "";
            const hash = lineHash(text);
            const remaining = baselined.get(hash) ?? 0;
            if (remaining > 0) baselined.set(hash, remaining - 1);
            else report(line, "unguarded");
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
