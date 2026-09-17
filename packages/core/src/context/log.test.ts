import { describe, expect, test, vi } from "vitest";

import type { Logger } from "./app.js";
import { silentLogger } from "../test/context.js";
import { logErrorSafely } from "./log.js";

const loggerThatThrows: Logger = {
  ...silentLogger,
  error: () => {
    throw new Error("transport down");
  },
};

describe("logErrorSafely", () => {
  test("a logger that throws does not reach the caller", () => {
    // Every caller is mid-failure and holding work it must not lose, so this
    // swallow is what lets them report without risking a second failure.
    expect(() =>
      logErrorSafely(loggerThatThrows, "[plumix] something failed", "cause"),
    ).not.toThrow();
  });

  test("the raw error survives a meta bag that names the same key", () => {
    const error = vi.fn();
    const cause = new Error("the real one");

    logErrorSafely({ ...silentLogger, error }, "[plumix] failed", cause, {
      taskId: "t",
      error: "a caller's stray key",
    });

    expect(error).toHaveBeenCalledWith("[plumix] failed: the real one", {
      taskId: "t",
      error: cause,
    });
  });
});
