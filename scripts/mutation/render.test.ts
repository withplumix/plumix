import { expect, test } from "vitest";

import { render } from "./render.ts";

test("a run with no survivors says so in one line", () => {
  expect(render([{ package: "packages/core", lines: [] }])).toBe(
    "No surviving mutants in the changed lines of 1 package.\n",
  );
});

test("lists each surviving line under its package, with what changed and which tests ran it", () => {
  const markdown = render([
    {
      package: "packages/plugins/seo",
      lines: [
        {
          at: "src/llms.ts:84",
          code: "if (path === null) return [];",
          status: "Survived",
          mutants: ["path === null → false"],
          ran: ["/llms.txt > lists the entries"],
        },
        {
          at: "src/llms.ts:71",
          code: 'return "";',
          status: "NoCoverage",
          mutants: ['"" → "Stryker was here!"'],
          ran: [],
        },
      ],
    },
  ]);

  expect(markdown).toBe(
    [
      "# 2 surviving lines in 1 package",
      "",
      "Read each as a question about the behaviour on that line: CODING_STANDARDS.md#mutation-testing says how to answer it.",
      "",
      "## packages/plugins/seo",
      "",
      "- Survived `src/llms.ts:84` `if (path === null) return [];`",
      "  - `path === null → false`",
      "  - ran: /llms.txt > lists the entries",
      '- No test runs `src/llms.ts:71` `return "";`',
      '  - `"" → "Stryker was here!"`',
      "",
    ].join("\n"),
  );
});
