import { describe, expect, test } from "vitest";

import type { DevErrorFrame } from "./contract.js";
import type { IslandErrorLogState } from "./island-error-log.js";
import { createIslandErrorLog, toDevErrorInfo } from "./island-error-log.js";

/** Stands in for a `<plumix-island>`; the log reads only its export name. */
function island(componentExport: string): {
  getAttribute(name: string): string | null;
} {
  return {
    getAttribute: (name) =>
      name === "component-export" ? componentExport : null,
  };
}

/** A log on a fresh target, recording every state it reports. */
function logOn(
  resolveFrames: (
    stack: string,
  ) => Promise<readonly DevErrorFrame[] | undefined> = () =>
    Promise.resolve(undefined),
) {
  const target = new EventTarget();
  const states: IslandErrorLogState[] = [];
  const log = createIslandErrorLog(target, {
    resolveFrames,
    onChange: (state) => states.push(state),
  });
  return { target, states, log };
}

function hydrationError(error: unknown, element?: unknown): CustomEvent {
  return new CustomEvent("plumix:hydration-error", {
    detail: { error, element },
    cancelable: true,
  });
}

function mismatch(element: unknown, componentStack: string): CustomEvent {
  return new CustomEvent("plumix:island-hydration-mismatch", {
    detail: { element, componentStack },
  });
}

describe("createIslandErrorLog", () => {
  test("reports nothing until an island error is captured", () => {
    const { states } = logOn();

    expect(states).toEqual([]);
  });

  test("cancels a hydration error's default, so the framework does not log it", () => {
    const { target } = logOn();

    const notPrevented = target.dispatchEvent(
      hydrationError(new Error("hydrate boom"), island("Counter")),
    );

    expect(notPrevented).toBe(false);
  });

  test("counts a doubly-dispatched identical mismatch once", () => {
    const { target, states } = logOn();
    target.dispatchEvent(mismatch(island("Clock"), "\n    at Clock"));

    target.dispatchEvent(mismatch(island("Clock"), "\n    at Clock"));

    expect(states.at(-1)?.errors).toHaveLength(1);
  });

  test("keeps the expanded dialog on the error being read when a newer one arrives", () => {
    const { target, states, log } = logOn();
    target.dispatchEvent(
      hydrationError(new Error("reading this"), island("Alpha")),
    );
    log.expand();

    target.dispatchEvent(hydrationError(new Error("newer"), island("Beta")));

    const state = states.at(-1);
    expect(state?.active).toBe(1);
    expect(state?.errors[1]?.label).toBe("<Alpha>");
    expect(state?.errors[1]?.info.message).toBe("reading this");
  });

  test("counts the same error object dispatched twice once", () => {
    const { target, states } = logOn();
    const error = new Error("same boom");
    target.dispatchEvent(hydrationError(error, island("Counter")));

    target.dispatchEvent(hydrationError(error, island("Counter")));

    expect(states.at(-1)?.errors).toHaveLength(1);
  });

  test("captures uncaught errors and unhandled rejections", () => {
    const { target, states } = logOn();
    target.dispatchEvent(
      Object.assign(new Event("error"), { error: new Error("async boom") }),
    );

    target.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("rejected boom"),
      }),
    );

    expect(states.at(-1)?.errors.map((e) => e.info.message)).toEqual([
      "rejected boom",
      "async boom",
    ]);
  });

  test("ignores an error event that carries no error object", () => {
    const { target, states } = logOn();

    target.dispatchEvent(
      Object.assign(new Event("error"), { message: "404 img" }),
    );

    expect(states).toEqual([]);
  });

  test("a frame resolution that lands after teardown reports nothing", async () => {
    let resolveFrames: (frames: readonly DevErrorFrame[]) => void = () =>
      undefined;
    const resolution = new Promise<readonly DevErrorFrame[]>((resolve) => {
      resolveFrames = resolve;
    });
    const { target, states, log } = logOn(() => resolution);
    const error = new Error("boom");
    error.stack = "Error: boom\n    at fn (http://localhost:5173/src/a.ts:1:0)";
    target.dispatchEvent(hydrationError(error, island("Counter")));
    log.teardown();

    resolveFrames([
      { functionName: "fn", file: "/src/a.ts", line: 1, isVendor: false },
    ]);
    await resolution;

    expect(states).toHaveLength(1);
  });

  test("pulses the count each time it climbs", () => {
    const { target, states } = logOn();
    target.dispatchEvent(hydrationError(new Error("first"), island("Alpha")));

    target.dispatchEvent(hydrationError(new Error("second"), island("Beta")));

    expect(states.map((s) => [s.errors.length, s.pulse])).toEqual([
      [1, true],
      [2, true],
    ]);
  });

  test("does not pulse again when the dialog reopens on a settled count", () => {
    const { target, states, log } = logOn();
    target.dispatchEvent(hydrationError(new Error("boom"), island("Counter")));
    log.expand();

    log.collapse();

    expect(states.at(-1)).toMatchObject({ expanded: false, pulse: false });
  });

  test("teardown stops capturing, and leaves a hydration error's default alone", () => {
    const { target, states, log } = logOn();
    log.teardown();

    const notPrevented = target.dispatchEvent(
      hydrationError(new Error("after"), island("Counter")),
    );

    expect(notPrevented).toBe(true);
    expect(states).toEqual([]);
  });
});

describe("toDevErrorInfo", () => {
  test("keeps an Error's name, message and raw stack", () => {
    const error = new TypeError("bad");
    error.stack = "TypeError: bad\n    at fn (http://localhost:5173/a.ts:1:0)";

    expect(toDevErrorInfo(error, "\n    at Counter")).toEqual({
      name: "TypeError",
      message: "bad",
      stack: "TypeError: bad\n    at fn (http://localhost:5173/a.ts:1:0)",
      componentStack: "\n    at Counter",
    });
  });

  test("names a thrown non-Error UnknownError, by its string form", () => {
    expect(toDevErrorInfo("boom")).toEqual({
      name: "UnknownError",
      message: "boom",
    });
  });
});
