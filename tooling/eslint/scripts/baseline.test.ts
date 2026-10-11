import { describe, expect, it } from "vitest";

import { repoRootOf } from "../rules/sync-comment-guarded.js";
import { occurrencesIn, syncBaseline } from "./baseline.js";

describe("occurrencesIn", () => {
  it("lists each coupling comment that names no guarding test, by the hash of its line", () => {
    const occurrences = occurrencesIn(repoRootOf(import.meta.filename), [
      {
        file: "packages/core/src/a.tsx",
        text: "const a = <b />;\n  // Mirrors the server's list.\nconst c = 1;\n",
      },
      {
        file: "packages/core/src/b.ts",
        text: "// Mirrors the server's list.\n// Guarded by: tooling/eslint/test/base-config.test.ts\nconst c = 1;\n",
      },
    ]);

    expect(occurrences).toEqual([
      { file: "packages/core/src/a.tsx", hash: "98a57b9564263b90", line: 2 },
    ]);
  });
});

describe("syncBaseline", () => {
  it("refuses to write a baseline that would grow", () => {
    const result = syncBaseline(
      [{ file: "packages/core/src/a.ts", hash: "1111111111111111" }],
      [
        { file: "packages/core/src/a.ts", hash: "1111111111111111", line: 3 },
        { file: "packages/core/src/b.ts", hash: "2222222222222222", line: 7 },
      ],
      "write",
    );

    expect(result).toEqual({
      baseline: null,
      problems: [
        "packages/core/src/b.ts:7 adds a coupling comment that names no guarding test.",
      ],
    });
  });

  it("writes the baseline shrunk to the occurrences still in the tree, sorted", () => {
    const result = syncBaseline(
      [
        { file: "packages/core/src/b.ts", hash: "2222222222222222" },
        { file: "packages/core/src/a.ts", hash: "1111111111111111" },
        { file: "packages/core/src/a.ts", hash: "3333333333333333" },
      ],
      [
        { file: "packages/core/src/b.ts", hash: "2222222222222222", line: 7 },
        { file: "packages/core/src/a.ts", hash: "1111111111111111", line: 3 },
      ],
      "write",
    );

    expect(result).toEqual({
      baseline: [
        { file: "packages/core/src/a.ts", hash: "1111111111111111" },
        { file: "packages/core/src/b.ts", hash: "2222222222222222" },
      ],
      problems: [],
    });
  });

  it("fails the check on an entry whose line is gone from its file", () => {
    const result = syncBaseline(
      [
        { file: "packages/core/src/a.ts", hash: "1111111111111111" },
        { file: "packages/core/src/a.ts", hash: "3333333333333333" },
      ],
      [{ file: "packages/core/src/a.ts", hash: "1111111111111111", line: 3 }],
      "check",
    );

    expect(result).toEqual({
      baseline: null,
      problems: [
        "packages/core/src/a.ts has no coupling comment hashed 3333333333333333. Run `pnpm --filter @plumix/eslint-config sync-baseline` to drop the entry.",
      ],
    });
  });

  it("passes the check when the baseline matches the tree", () => {
    const result = syncBaseline(
      [{ file: "packages/core/src/a.ts", hash: "1111111111111111" }],
      [{ file: "packages/core/src/a.ts", hash: "1111111111111111", line: 3 }],
      "check",
    );

    expect(result).toEqual({ baseline: null, problems: [] });
  });
});
