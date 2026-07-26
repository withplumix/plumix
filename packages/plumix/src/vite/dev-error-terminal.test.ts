import { describe, expect, test, vi } from "vitest";

import type { DevErrorFrame, ForwardedLog } from "@plumix/blocks/dev-error";

import {
  createTerminalForwarder,
  formatForwardedLog,
} from "./dev-error-terminal.js";

const ROOT = "/proj";

function frame(over: Partial<DevErrorFrame>): DevErrorFrame {
  return {
    file: "/proj/src/Counter.tsx",
    line: 14,
    column: 20,
    isVendor: false,
    ...over,
  };
}

describe("formatForwardedLog", () => {
  test("prints an exception with its app frames, project-relative", () => {
    const log: ForwardedLog = {
      kind: "exception",
      level: "error",
      message: "Error: render boom",
      label: "<Counter>",
    };
    const out = formatForwardedLog(
      log,
      [
        frame({ functionName: "Counter" }),
        frame({
          file: "/proj/src/main.tsx",
          line: 3,
          column: 7,
          functionName: undefined,
        }),
      ],
      ROOT,
    );

    expect(out).toBe(
      [
        "[browser] <Counter> Error: render boom",
        "    at Counter (src/Counter.tsx:14:20)",
        "    at src/main.tsx:3:7",
      ].join("\n"),
    );
  });

  test("collapses framework frames into a trailing count", () => {
    const out = formatForwardedLog(
      { kind: "exception", level: "error", message: "Error: boom" },
      [
        frame({ functionName: "App" }),
        frame({
          file: "/proj/node_modules/react-dom/client.js",
          isVendor: true,
        }),
        frame({ file: "/proj/node_modules/react/index.js", isVendor: true }),
      ],
      ROOT,
    );

    expect(out).toContain("    at App (src/Counter.tsx:14:20)");
    expect(out).toContain("    … 2 framework frames");
  });

  test("shows a console log on one line with its source location", () => {
    const out = formatForwardedLog(
      { kind: "console", level: "warn", message: "deprecated call" },
      [frame({ file: "/proj/src/widget.tsx", line: 9, column: 2 })],
      ROOT,
    );

    expect(out).toBe(
      "[browser] console.warn: deprecated call (src/widget.tsx:9:2)",
    );
  });

  test("omits the location when no frames resolved", () => {
    const out = formatForwardedLog(
      { kind: "console", level: "error", message: "no stack here" },
      [],
      ROOT,
    );

    expect(out).toBe("[browser] console.error: no stack here");
  });

  test("keeps a path outside the project root absolute", () => {
    const out = formatForwardedLog(
      { kind: "console", level: "error", message: "x" },
      [frame({ file: "/elsewhere/pkg/a.ts", line: 1, column: 1 })],
      ROOT,
    );

    expect(out).toBe("[browser] console.error: x (/elsewhere/pkg/a.ts:1:1)");
  });
});

describe("createTerminalForwarder", () => {
  function deps(frames: DevErrorFrame[] = []) {
    const lines: string[] = [];
    return {
      lines,
      resolveStack: vi.fn(() => Promise.resolve(frames)),
      print: (line: string) => lines.push(line),
      root: ROOT,
    };
  }

  function body(logs: ForwardedLog[]): string {
    return JSON.stringify({ logs });
  }

  test("resolves the stack and prints a forwarded exception", async () => {
    const d = deps([frame({ functionName: "Counter" })]);
    const forwarder = createTerminalForwarder(d);

    const result = await forwarder.handle(
      body([
        {
          kind: "exception",
          level: "error",
          message: "Error: render boom",
          stack:
            "Error: render boom\n    at Counter (http://localhost/src/Counter.tsx:1:0)",
        },
      ]),
    );

    expect(result.status).toBe(200);
    expect(d.resolveStack).toHaveBeenCalledOnce();
    expect(d.lines).toEqual([
      "[browser] Error: render boom\n    at Counter (src/Counter.tsx:14:20)",
    ]);
  });

  test("collapses consecutive identical logs into a running count", async () => {
    const d = deps([frame({})]);
    const forwarder = createTerminalForwarder(d);
    const log: ForwardedLog = {
      kind: "console",
      level: "error",
      message: "same boom",
      stack: "Error\n    at http://localhost/src/Counter.tsx:1:0",
    };

    await forwarder.handle(body([log, log, log]));

    // First is full; the two repeats collapse to a compact counted line each,
    // never re-dumping the location block.
    expect(d.lines).toEqual([
      "[browser] console.error: same boom (src/Counter.tsx:14:20)",
      "[browser] console.error: same boom (×2)",
      "[browser] console.error: same boom (×3)",
    ]);
  });

  test("a distinct log resets the collapse run", async () => {
    const d = deps([]);
    const forwarder = createTerminalForwarder(d);

    await forwarder.handle(
      body([
        { kind: "console", level: "error", message: "a" },
        { kind: "console", level: "error", message: "a" },
        { kind: "console", level: "error", message: "b" },
        { kind: "console", level: "error", message: "a" },
      ]),
    );

    expect(d.lines).toEqual([
      "[browser] console.error: a",
      "[browser] console.error: a (×2)",
      "[browser] console.error: b",
      "[browser] console.error: a",
    ]);
  });

  test("collapse persists across separate requests (dev session state)", async () => {
    const d = deps([]);
    const forwarder = createTerminalForwarder(d);
    const log: ForwardedLog = { kind: "console", level: "warn", message: "w" };

    await forwarder.handle(body([log]));
    await forwarder.handle(body([log]));

    expect(d.lines).toEqual([
      "[browser] console.warn: w",
      "[browser] console.warn: w (×2)",
    ]);
  });

  test("returns 400 and prints nothing for a malformed body", async () => {
    const d = deps();
    const forwarder = createTerminalForwarder(d);

    expect((await forwarder.handle("not json")).status).toBe(400);
    expect((await forwarder.handle(JSON.stringify({ logs: 5 }))).status).toBe(
      400,
    );
    expect(d.lines).toEqual([]);
  });

  test("strips control characters from the client-controlled message and label", async () => {
    const d = deps([]);
    const forwarder = createTerminalForwarder(d);

    // A raw ESC survives the JSON round-trip; each control byte becomes a space
    // so no ANSI/OSC escape reaches the developer's terminal.
    await forwarder.handle(
      body([
        {
          kind: "exception",
          level: "error",
          message: "boom\u001b[2Jwiped",
          label: "<Ev\u001bil>",
        },
      ]),
    );

    expect(d.lines).toEqual(["[browser] <Ev il> boom [2Jwiped"]);
  });

  test("skips entries that don't look like a forwarded log", async () => {
    const d = deps([]);
    const forwarder = createTerminalForwarder(d);

    const result = await forwarder.handle(
      JSON.stringify({
        logs: [
          { kind: "console", level: "error" }, // no message
          { kind: "console", level: "error", message: "ok" },
        ],
      }),
    );

    expect(result.status).toBe(200);
    expect(d.lines).toEqual(["[browser] console.error: ok"]);
  });
});
