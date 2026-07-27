import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ForwardedLog } from "./terminal-forward.js";
import {
  installTerminalForwarding,
  parseForwardLevel,
} from "./terminal-forward.js";

const ENDPOINT = "/@plumix-dev-error-terminal";

let uninstall: () => void = () => undefined;
let fetchMock: ReturnType<typeof vi.fn>;
// A manual scheduler: forwarding batches into a queue and flushes when the
// captured callback runs, so a test drives the flush deterministically.
let flush: () => void = () => undefined;

function schedule(run: () => void): void {
  flush = run;
}

function install(level: "off" | "error" | "warn" | "log" = "warn"): void {
  uninstall = installTerminalForwarding({
    level,
    endpoint: ENDPOINT,
    schedule,
  });
}

// Every POSTed batch's logs, flattened in order.
function forwarded(): ForwardedLog[] {
  const logs: ForwardedLog[] = [];
  for (const call of fetchMock.mock.calls) {
    const body = JSON.parse((call[1] as { body: string }).body) as {
      logs: ForwardedLog[];
    };
    logs.push(...body.logs);
  }
  return logs;
}

function island(componentExport: string): HTMLElement {
  const el = document.createElement("plumix-island");
  el.setAttribute("component-export", componentExport);
  return el;
}

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  uninstall();
  uninstall = () => undefined;
  flush = () => undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("installTerminalForwarding", () => {
  test("forwards console.error, calling through to the original", () => {
    const original = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    install();

    console.error("boom", { code: 1 });
    flush();

    // The original console still ran (browser devtools keep showing it).
    expect(original).toHaveBeenCalledWith("boom", { code: 1 });
    const logs = forwarded();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      kind: "console",
      level: "error",
      message: 'boom {"code":1}',
    });
  });

  test("does not forward console.log at the default (warn) level", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    install();

    console.log("just a log");
    flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("forwards console.log, info, and debug at the log level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    install("log");

    console.log("chatty", 42);
    console.info("informative");
    console.debug("detail");
    flush();

    // The originals still run so browser devtools keep showing them.
    expect(log).toHaveBeenCalledWith("chatty", 42);
    expect(info).toHaveBeenCalledWith("informative");
    expect(debug).toHaveBeenCalledWith("detail");
    expect(forwarded()).toMatchObject([
      { kind: "console", level: "log", message: "chatty 42" },
      { kind: "console", level: "info", message: "informative" },
      { kind: "console", level: "debug", message: "detail" },
    ]);
  });

  test("the log level still forwards errors and warnings", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    install("log");

    console.error("boom");
    console.warn("deprecated");
    flush();

    expect(forwarded().map((l) => l.level)).toEqual(["error", "warn"]);
  });

  test("does not forward console.info or debug below the log level", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    install("warn");

    console.info("informative");
    console.debug("detail");
    flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("forwards console.warn at the default level but not at error-only", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    install("warn");
    console.warn("deprecated");
    flush();
    expect(forwarded()).toHaveLength(1);
    expect(forwarded()[0]?.level).toBe("warn");

    uninstall();
    fetchMock.mockClear();
    install("error");
    console.warn("deprecated again");
    flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("installs nothing when disabled", () => {
    const original = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    install("off");

    console.error("boom");
    flush();

    expect(original).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("forwards an island error with its label and stack", () => {
    install();
    const error = new Error("render boom");
    error.stack = "Error: render boom\n    at Counter (x:1:1)";

    window.dispatchEvent(
      new CustomEvent("plumix:island-error", {
        detail: { error, element: island("Counter") },
      }),
    );
    flush();

    const logs = forwarded();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      kind: "exception",
      level: "error",
      message: "Error: render boom",
      stack: "Error: render boom\n    at Counter (x:1:1)",
      label: "<Counter>",
    });
  });

  test("forwards uncaught window errors and unhandled rejections", () => {
    install();

    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("async boom") }),
    );
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = new Error("rejected boom");
    window.dispatchEvent(rejection);
    flush();

    const messages = forwarded().map((l) => l.message);
    expect(messages).toContain("Error: async boom");
    expect(messages).toContain("Error: rejected boom");
  });

  test("ignores error events that carry no error object", () => {
    install();
    window.dispatchEvent(new ErrorEvent("error", { message: "404 img" }));
    flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not forward the same error object twice", () => {
    install();
    const error = new Error("same");

    window.dispatchEvent(
      new CustomEvent("plumix:hydration-error", { detail: { error } }),
    );
    // The window `error` handler sees the same object — must not re-forward it.
    window.dispatchEvent(new ErrorEvent("error", { error }));
    flush();

    expect(forwarded()).toHaveLength(1);
  });

  test("forwards a repeated primitive throw each time (server collapses it)", () => {
    install();
    // Primitives have no identity; the client must not swallow repeats — the
    // server is what collapses genuine consecutive duplicates into a count.
    window.dispatchEvent(new ErrorEvent("error", { error: "boom" }));
    window.dispatchEvent(new ErrorEvent("error", { error: "boom" }));
    flush();

    expect(forwarded()).toHaveLength(2);
  });

  test("skips a console.error re-logging an already-forwarded exception", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    install();
    const error = new Error("island boom");

    // The island renderer's shape: dispatch the island error, then log it.
    window.dispatchEvent(
      new CustomEvent("plumix:island-error", { detail: { error } }),
    );
    console.error(error);
    flush();

    const logs = forwarded();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.kind).toBe("exception");
  });

  test("still forwards genuinely repeated console.error strings", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    install();

    console.error("repeated");
    console.error("repeated");
    flush();

    // Two distinct calls — the server collapses these, not the client.
    expect(forwarded()).toHaveLength(2);
  });

  test("batches several events into a single POST", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    install();

    console.error("one");
    console.error("two");
    flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forwarded().map((l) => l.message)).toEqual(["one", "two"]);
  });

  test("is idempotent — a second install does not double-patch console", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const first = installTerminalForwarding({
      level: "warn",
      endpoint: ENDPOINT,
      schedule,
    });
    // A second bootstrap (e.g. HMR re-run) must reuse the first, not stack a
    // second console wrapper and listener set.
    const second = installTerminalForwarding({
      level: "warn",
      endpoint: ENDPOINT,
      schedule,
    });
    uninstall = first;
    expect(second).toBe(first);

    console.error("once");
    flush();

    expect(forwarded()).toHaveLength(1);
  });

  test("teardown restores console and stops forwarding", () => {
    const original = console.error;
    install();
    expect(console.error).not.toBe(original);

    uninstall();
    uninstall = () => undefined;
    expect(console.error).toBe(original);

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    console.error("after");
    flush();
    expect(fetchMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("parseForwardLevel", () => {
  test("defaults to warn (errors + warnings) when unset", () => {
    expect(parseForwardLevel("")).toBe("warn");
    expect(parseForwardLevel(undefined)).toBe("warn");
  });

  test("disables on off / false", () => {
    expect(parseForwardLevel("off")).toBe("off");
    expect(parseForwardLevel("false")).toBe("off");
  });

  test("recognizes error-only", () => {
    expect(parseForwardLevel("error")).toBe("error");
  });

  test("recognizes log (the verbose level that adds log/info/debug)", () => {
    expect(parseForwardLevel("log")).toBe("log");
    expect(parseForwardLevel("LOG")).toBe("log");
  });

  test("treats any other value as the warn default", () => {
    expect(parseForwardLevel("warn")).toBe("warn");
    expect(parseForwardLevel("anything")).toBe("warn");
  });
});
