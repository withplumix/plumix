import { expect, test } from "vitest";

import type { MutationReport } from "./summary.ts";
import { summarize } from "./summary.ts";

const SOURCE = "export function f(a: number) {\n  return a > 0 ? 1 : 2;\n}\n";

function mutant(
  over: Partial<MutationReport["files"][string]["mutants"][number]>,
) {
  return {
    id: "1",
    mutatorName: "EqualityOperator",
    replacement: "a >= 0",
    status: "Survived",
    location: { start: { line: 2, column: 10 }, end: { line: 2, column: 15 } },
    coveredBy: ["t1"],
    testsCompleted: 1,
    ...over,
  };
}

function report(mutants: ReturnType<typeof mutant>[]): MutationReport {
  return {
    files: { "src/f.ts": { source: SOURCE, mutants } },
    testFiles: {
      "src/f.test.ts": {
        tests: [{ id: "t1", name: "f > is one for a positive" }],
      },
    },
  };
}

test("groups a line's unkilled mutants under its code", () => {
  const summary = summarize(
    report([
      mutant({}),
      mutant({
        id: "2",
        mutatorName: "ConditionalExpression",
        replacement: "true",
      }),
    ]),
  );

  expect(summary.lines).toEqual([
    {
      at: "src/f.ts:2",
      code: "return a > 0 ? 1 : 2;",
      status: "Survived",
      mutants: ["a > 0 → a >= 0", "a > 0 → true"],
      ran: ["f > is one for a positive"],
    },
  ]);
});

test("a line counts as survived when any of its mutants survived", () => {
  const summary = summarize(
    report([
      mutant({ status: "NoCoverage", coveredBy: [], testsCompleted: 0 }),
      mutant({ id: "2", replacement: "true" }),
    ]),
  );

  expect(summary.lines.map((line) => line.status)).toEqual(["Survived"]);
});

test("a survivor that ran no test is a broken run, not a gap", () => {
  const summary = summarize(report([mutant({ testsCompleted: 0 })]));

  expect(summary).toMatchObject({ lines: [], broken: ["src/f.ts:2"] });
});
