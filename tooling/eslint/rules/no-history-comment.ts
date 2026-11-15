import type { Rule } from "eslint";

import { blockProse, lineAt, startsOwnLine } from "./comment-block.js";
import { groupIntoBlocks } from "./max-comment-length.js";

/**
 * After a be-verb or punctuation the phrase states a purpose, not a past: "is
 * used to render", "(used to view a draft)".
 */
const HISTORY =
  /\b(?:for now|previously|no longer|we changed|(?<!(?:^|\b(?:is|are|was|were|be|been|being|get|gets|got|gotten)|[(,:;—–-])\s*)used to)\b/gi;

const TICKET = /(?<![&#])#\d+\b/g;

/** `owner/repo#123` is GitHub's own cross-repository form. */
const OWNER_REPO = /[\w.-]+\/[\w.-]+$/;

/**
 * Upstream projects whose tracker is not a GitHub repository, so no
 * `owner/repo#123` can name them: "WordPress #18268" is a Trac ticket.
 */
const UPSTREAM_PROJECTS = ["WordPress", "WordPress Trac"];

const CODE_SPAN = /`[^`]*`/g;
const URL = /\b[a-z][a-z+.-]*:\/\/\S+/gi;

/** Blanking keeps every index in place, so a match still maps to its line. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (found) => " ".repeat(found.length));
}

function isUpstream(before: string): boolean {
  return (
    OWNER_REPO.test(before) ||
    UPSTREAM_PROJECTS.some((project) => before.endsWith(`${project} `))
  );
}

export const noHistoryComment: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow history in comments: ticket numbers and words that narrate a past.",
    },
    messages: {
      ticket:
        "`{{found}}` is a ticket number, which is history (CODING_STANDARDS.md#comments). State the reason itself; the PR body is where history goes. An upstream reference may stay as `owner/repo#123` or a full URL.",
      history:
        '"{{found}}" narrates history (CODING_STANDARDS.md#comments). Say why the code is as it is; the PR body is where history goes.',
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const report = (line: number, messageId: string, found: string): void => {
      context.report({
        loc: {
          start: { line, column: 0 },
          end: { line, column: sourceCode.lines[line - 1]?.length ?? 0 },
        },
        messageId,
        data: { found },
      });
    };
    return {
      Program() {
        const blocks = groupIntoBlocks(sourceCode.getAllComments(), (comment) =>
          startsOwnLine(sourceCode, comment),
        );
        for (const block of blocks) {
          const prose = blockProse(block);
          const text = blank(blank(prose.text, CODE_SPAN), URL);
          for (const match of text.matchAll(TICKET)) {
            if (isUpstream(text.slice(0, match.index))) continue;
            report(lineAt(prose.lines, match.index), "ticket", match[0]);
          }
          for (const match of text.matchAll(HISTORY)) {
            report(lineAt(prose.lines, match.index), "history", match[0]);
          }
        }
      },
    };
  },
};
