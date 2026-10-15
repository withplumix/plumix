import type { Mock } from "vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ForwardedLog, ForwardTarget } from "./terminal-forward.js";
import {
  installTerminalForwarding,
  parseForwardLevel,
} from "./terminal-forward.js";

const ENDPOINT = "/@plumix-dev-error-terminal";

type FakeConsole = Record<"error" | "warn" | "log" | "info" | "debug", Mock>;

/** A page stand-in: its own events, a console of spies and a recording fetch. */
interface FakePage extends ForwardTarget {
  readonly console: FakeConsole;
  readonly fetch: Mock<typeof fetch>;
}

let uninstall: () => void = () => undefined;

afterEach(() => {
  uninstall();
  uninstall = () => undefined;
});

function fakePage(): FakePage {
  return Object.assign(new EventTarget(), {
    console: {
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
    fetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response(null))),
  });
}

/**
 * Installs on `page` with a manual scheduler, so a test flushes the batch
 * deterministically by calling what this returns.
 */
function install(
  page: FakePage,
  level: "off" | "error" | "warn" | "log" = "warn",
): () => void {
  let flush: () => void = () => undefined;
  uninstall = installTerminalForwarding({
    target: page,
    level,
    endpoint: ENDPOINT,
    schedule: (run) => {
      flush = run;
    },
  });
  return () => flush();
}

/** Every POSTed batch's logs, flattened in order. */
function forwarded(page: FakePage): ForwardedLog[] {
  return page.fetch.mock.calls.flatMap(([, init]) => {
    const body = JSON.parse(init?.body as string) as { logs: ForwardedLog[] };
    return body.logs;
  });
}

function island(componentExport: string): {
  getAttribute(name: string): string | null;
} {
  return {
    getAttribute: (name) =>
      name === "component-export" ? componentExport : null,
  };
}

function uncaught(error: unknown): Event {
  return Object.assign(new Event("error"), { error });
}

describe("installTerminalForwarding", () => {
  test("forwards console.error, calling through to the original", () => {
    const page = fakePage();
    const original = page.console.error;
    const flush = install(page);

    page.console.error("boom", { code: 1 });
    flush();

    expect(original).toHaveBeenCalledWith("boom", { code: 1 });
    expect(forwarded(page)).toEqual([
      expect.objectContaining({
        kind: "console",
        level: "error",
        message: 'boom {"code":1}',
      }),
    ]);
  });

  test("does not forward console.log at the default (warn) level", () => {
    const page = fakePage();
    const flush = install(page);

    page.console.log("just a log");
    flush();

    expect(page.fetch).not.toHaveBeenCalled();
  });

  test("forwards console.log, info, and debug at the log level", () => {
    const page = fakePage();
    const flush = install(page, "log");

    page.console.log("chatty", 42);
    page.console.info("informative");
    page.console.debug("detail");
    flush();

    expect(forwarded(page)).toMatchObject([
      { kind: "console", level: "log", message: "chatty 42" },
      { kind: "console", level: "info", message: "informative" },
      { kind: "console", level: "debug", message: "detail" },
    ]);
  });

  test("the log level still forwards errors and warnings", () => {
    const page = fakePage();
    const flush = install(page, "log");

    page.console.error("boom");
    page.console.warn("deprecated");
    flush();

    expect(forwarded(page).map((l) => l.level)).toEqual(["error", "warn"]);
  });

  test("does not forward console.info or debug below the log level", () => {
    const page = fakePage();
    const flush = install(page, "warn");

    page.console.info("informative");
    page.console.debug("detail");
    flush();

    expect(page.fetch).not.toHaveBeenCalled();
  });

  test("forwards console.warn at the default level", () => {
    const page = fakePage();
    const flush = install(page, "warn");

    page.console.warn("deprecated");
    flush();

    expect(forwarded(page)).toMatchObject([
      { level: "warn", message: "deprecated" },
    ]);
  });

  test("does not forward console.warn at the error-only level", () => {
    const page = fakePage();
    const flush = install(page, "error");

    page.console.warn("deprecated");
    flush();

    expect(page.fetch).not.toHaveBeenCalled();
  });

  test("installs nothing when disabled", () => {
    const page = fakePage();
    const original = page.console.error;
    const flush = install(page, "off");

    page.console.error("boom");
    flush();

    expect(page.console.error).toBe(original);
    expect(page.fetch).not.toHaveBeenCalled();
  });

  test("forwards an island error with its label and stack", () => {
    const page = fakePage();
    const flush = install(page);
    const error = new Error("render boom");
    error.stack = "Error: render boom\n    at Counter (x:1:1)";

    page.dispatchEvent(
      new CustomEvent("plumix:island-error", {
        detail: { error, element: island("Counter") },
      }),
    );
    flush();

    expect(forwarded(page)).toEqual([
      {
        kind: "exception",
        level: "error",
        message: "Error: render boom",
        stack: "Error: render boom\n    at Counter (x:1:1)",
        label: "<Counter>",
      },
    ]);
  });

  test("forwards uncaught errors and unhandled rejections", () => {
    const page = fakePage();
    const flush = install(page);

    page.dispatchEvent(uncaught(new Error("async boom")));
    page.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("rejected boom"),
      }),
    );
    flush();

    expect(forwarded(page).map((l) => l.message)).toEqual([
      "Error: async boom",
      "Error: rejected boom",
    ]);
  });

  test("ignores error events that carry no error object", () => {
    const page = fakePage();
    const flush = install(page);

    page.dispatchEvent(
      Object.assign(new Event("error"), { message: "404 img" }),
    );
    flush();

    expect(page.fetch).not.toHaveBeenCalled();
  });

  test("does not forward the same error object twice", () => {
    const page = fakePage();
    const flush = install(page);
    const error = new Error("same");

    page.dispatchEvent(
      new CustomEvent("plumix:hydration-error", { detail: { error } }),
    );
    page.dispatchEvent(uncaught(error));
    flush();

    expect(forwarded(page)).toHaveLength(1);
  });

  test("forwards a repeated primitive throw each time (the server collapses it)", () => {
    const page = fakePage();
    const flush = install(page);

    page.dispatchEvent(uncaught("boom"));
    page.dispatchEvent(uncaught("boom"));
    flush();

    expect(forwarded(page).map((l) => l.message)).toEqual(["boom", "boom"]);
  });

  test("skips a console.error re-logging an already-forwarded exception", () => {
    const page = fakePage();
    const flush = install(page);
    const error = new Error("island boom");

    // The island renderer's shape: dispatch the island error, then log it.
    page.dispatchEvent(
      new CustomEvent("plumix:island-error", { detail: { error } }),
    );
    page.console.error(error);
    flush();

    expect(forwarded(page)).toMatchObject([{ kind: "exception" }]);
  });

  test("still forwards genuinely repeated console.error strings", () => {
    const page = fakePage();
    const flush = install(page);

    page.console.error("repeated");
    page.console.error("repeated");
    flush();

    expect(forwarded(page).map((l) => l.message)).toEqual([
      "repeated",
      "repeated",
    ]);
  });

  test("batches several events into a single POST", () => {
    const page = fakePage();
    const flush = install(page);

    page.console.error("one");
    page.console.error("two");
    flush();

    expect(page.fetch).toHaveBeenCalledTimes(1);
    expect(forwarded(page).map((l) => l.message)).toEqual(["one", "two"]);
  });

  test("is idempotent: a second install does not double-patch the console", () => {
    const page = fakePage();
    const flush = install(page);

    const second = installTerminalForwarding({ target: page, level: "warn" });
    page.console.error("once");
    flush();

    expect(second).toBe(uninstall);
    expect(forwarded(page)).toHaveLength(1);
  });

  test("teardown restores the console and stops forwarding", () => {
    const page = fakePage();
    const original = page.console.error;
    const flush = install(page);

    uninstall();
    page.console.error("after");
    flush();

    expect(page.console.error).toBe(original);
    expect(page.fetch).not.toHaveBeenCalled();
  });
});

describe("parseForwardLevel", () => {
  test.each(["", undefined])(
    "defaults to warn (errors + warnings) when unset (%o)",
    (raw) => {
      expect(parseForwardLevel(raw)).toBe("warn");
    },
  );

  test.each(["off", "false"])("disables on %s", (raw) => {
    expect(parseForwardLevel(raw)).toBe("off");
  });

  test("recognizes error-only", () => {
    expect(parseForwardLevel("error")).toBe("error");
  });

  test.each(["log", "LOG"])(
    "recognizes %s (the verbose level that adds log/info/debug)",
    (raw) => {
      expect(parseForwardLevel(raw)).toBe("log");
    },
  );

  test.each(["warn", "anything"])("treats %s as the warn default", (raw) => {
    expect(parseForwardLevel(raw)).toBe("warn");
  });
});
