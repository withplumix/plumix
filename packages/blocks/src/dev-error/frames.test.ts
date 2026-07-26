import { describe, expect, test } from "vitest";

import type { DevErrorFrame } from "./contract.js";
import {
  commonBaseDir,
  parseStackFrames,
  relativeFramePath,
} from "./frames.js";

function frame(file: string): DevErrorFrame {
  return { file, line: 1, isVendor: file.includes("/node_modules/") };
}

describe("parseStackFrames", () => {
  test("parses a V8 frame with a function name into file, line, and column", () => {
    const stack = [
      "TypeError: boom",
      "    at render (/proj/src/theme.tsx:12:7)",
    ].join("\n");

    expect(parseStackFrames(stack)).toEqual([
      {
        functionName: "render",
        file: "/proj/src/theme.tsx",
        line: 12,
        column: 7,
        isVendor: false,
      },
    ]);
  });

  test("parses an anonymous frame with no function name", () => {
    const stack = ["Error: x", "    at /proj/src/entry.ts:3:1"].join("\n");

    expect(parseStackFrames(stack)).toEqual([
      {
        file: "/proj/src/entry.ts",
        line: 3,
        column: 1,
        isVendor: false,
      },
    ]);
  });

  test("classifies node_modules frames (incl. pnpm) as vendor", () => {
    const stack = [
      "Error: x",
      "    at renderToString (/proj/node_modules/.pnpm/react-dom@19/node_modules/react-dom/server.js:100:5)",
      "    at App (/proj/src/app.tsx:4:2)",
    ].join("\n");

    const frames = parseStackFrames(stack);
    expect(frames.map((f) => f.isVendor)).toEqual([true, false]);
  });

  test("strips a file:// URL prefix so the path is a real fs path", () => {
    const stack = ["Error: x", "    at foo (file:///proj/src/a.ts:1:2)"].join(
      "\n",
    );

    expect(parseStackFrames(stack)[0]?.file).toBe("/proj/src/a.ts");
  });

  test("drops the header and any lines that are not locatable frames", () => {
    const stack = [
      "TypeError: cannot read properties of undefined",
      "    at Object.<anonymous>",
      "    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
      "    at handler (/proj/src/route.ts:8:9)",
    ].join("\n");

    const frames = parseStackFrames(stack);
    // `node:internal` is still a locatable frame (has file:line) and is vendor;
    // the bare `at Object.<anonymous>` line has no location and is dropped.
    expect(frames).toEqual([
      {
        functionName: "process.processTicksAndRejections",
        file: "node:internal/process/task_queues",
        line: 95,
        column: 5,
        isVendor: true,
      },
      {
        functionName: "handler",
        file: "/proj/src/route.ts",
        line: 8,
        column: 9,
        isVendor: false,
      },
    ]);
  });

  test("keeps a path containing parentheses whole (splits on the first ' (')", () => {
    const stack = "Error: x\n    at fn (/repo/(group)/file.ts:5:3)";

    expect(parseStackFrames(stack)).toEqual([
      {
        functionName: "fn",
        file: "/repo/(group)/file.ts",
        line: 5,
        column: 3,
        isVendor: false,
      },
    ]);
  });

  test("returns an empty list for a stack with no frames", () => {
    expect(parseStackFrames("Error: just a message")).toEqual([]);
    expect(parseStackFrames("")).toEqual([]);
    // A frame-like line with no location is dropped rather than mis-parsed.
    expect(parseStackFrames("    at some.thing.without.a.location")).toEqual(
      [],
    );
  });
});

describe("commonBaseDir", () => {
  test("finds the shared directory prefix across frames, cut on a boundary", () => {
    const base = commonBaseDir([
      frame("/repo/apps/demo/theme/fallback.tsx"),
      frame("/repo/packages/core/src/render.tsx"),
      frame("/repo/node_modules/react-dom/server.js"),
    ]);

    expect(base).toBe("/repo/");
  });

  test("does not cut mid-segment when paths share a partial name", () => {
    // `/repo/app` and `/repo/apple` share the chars `/repo/app` but the base
    // must fall back to the last real boundary, `/repo/`.
    expect(
      commonBaseDir([frame("/repo/app/a.ts"), frame("/repo/apple/b.ts")]),
    ).toBe("/repo/");
  });

  test("returns an empty base when there is nothing meaningful to strip", () => {
    expect(commonBaseDir([frame("/repo/only.ts")])).toBe("");
    expect(commonBaseDir([])).toBe("");
  });
});

describe("relativeFramePath", () => {
  test("strips the base prefix, leaving outside paths untouched", () => {
    expect(relativeFramePath("/repo/apps/demo/x.tsx", "/repo/")).toBe(
      "apps/demo/x.tsx",
    );
    expect(relativeFramePath("/elsewhere/y.ts", "/repo/")).toBe(
      "/elsewhere/y.ts",
    );
    expect(relativeFramePath("/repo/x.ts", "")).toBe("/repo/x.ts");
  });
});
