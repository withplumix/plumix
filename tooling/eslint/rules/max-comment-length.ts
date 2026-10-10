import type { Rule } from "eslint";

type Comment = ReturnType<
  Rule.RuleContext["sourceCode"]["getAllComments"]
>[number];

const MAX_WORDS = 30;
const WORD = /[A-Za-z]/;
const DIRECTIVE =
  /^\s*(eslint[\s-]|@ts-|prettier-ignore|global\s|[cv]8\s|istanbul\s|[#@]__PURE__|@vite-ignore|\/\s*<reference)/;

function countWords(comments: readonly Comment[]): number {
  return comments
    .flatMap((comment) => comment.value.split(/\s+/))
    .filter((word) => WORD.test(word)).length;
}

function groupIntoBlocks(
  comments: readonly Comment[],
  startsOwnLine: (comment: Comment) => boolean,
): Comment[][] {
  const blocks: Comment[][] = [];
  let previous: Comment | undefined;
  for (const comment of comments) {
    const continues =
      previous !== undefined &&
      startsOwnLine(previous) &&
      startsOwnLine(comment) &&
      comment.loc?.start.line === (previous.loc?.end.line ?? 0) + 1;
    if (continues) blocks.at(-1)?.push(comment);
    else blocks.push([comment]);
    previous = comment;
  }
  return blocks;
}

export const maxCommentLength: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: `Disallow a comment block longer than ${MAX_WORDS} words.`,
    },
    messages: {
      tooLong:
        "This comment runs {{count}} words; the limit is {{max}}. Let names and types carry what the code does, and keep only the reason the code can't state.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const startsOwnLine = (comment: Comment): boolean => {
      const line = comment.loc?.start.line ?? 0;
      const column = comment.loc?.start.column ?? 0;
      return sourceCode.lines[line - 1]?.slice(0, column).trim() === "";
    };
    return {
      Program() {
        const prose = sourceCode
          .getAllComments()
          .filter((comment) => !DIRECTIVE.test(comment.value));
        for (const block of groupIntoBlocks(prose, startsOwnLine)) {
          const count = countWords(block);
          const first = block[0]?.loc;
          const last = block.at(-1)?.loc;
          if (count <= MAX_WORDS || !first || !last) continue;
          context.report({
            loc: { start: first.start, end: last.end },
            messageId: "tooLong",
            data: { count: String(count), max: String(MAX_WORDS) },
          });
        }
      },
    };
  },
};
