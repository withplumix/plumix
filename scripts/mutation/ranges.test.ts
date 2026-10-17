import { expect, test } from "vitest";

import { changedRanges, isMutable } from "./ranges.ts";

test("a hunk gives the lines it adds on the new side", () => {
  expect(changedRanges("@@ -12,0 +13,4 @@ a\n+x\n+x\n+x\n+x\n")).toEqual([
    { start: 13, end: 16 },
  ]);
});

test("a hunk that only deletes leaves no line to mutate", () => {
  expect(changedRanges("@@ -20,3 +19,0 @@ a\n-x\n-x\n-x\n")).toEqual([]);
});

test("a hunk without a count changes one line", () => {
  expect(changedRanges("@@ -5 +5 @@ a\n-x\n+y\n")).toEqual([
    { start: 5, end: 5 },
  ]);
});

test("hunks that touch merge into one range", () => {
  expect(
    changedRanges(
      "@@ -1,0 +2,2 @@\n+x\n+x\n@@ -3,0 +4,1 @@\n+x\n@@ -9 +10 @@\n-x\n+y\n",
    ),
  ).toEqual([
    { start: 2, end: 4 },
    { start: 10, end: 10 },
  ]);
});

test.each([
  ["src/route/match.ts", true],
  ["src/thread/comment-item.tsx", true],
  ["src/route/match.test.ts", false],
  ["src/env.d.ts", false],
  ["src/test/harness.ts", false],
  ["e2e/editor.spec.ts", false],
  ["vite.config.ts", false],
])("%s is mutable: %s", (file, mutable) => {
  expect(isMutable(file)).toBe(mutable);
});
