import { describe, expect, test } from "vitest";

import { fakeLogger } from "./logger-fake.js";

describe("a line the site logged", () => {
  test("is recorded with its level, message and meta", () => {
    const logger = fakeLogger();

    logger.warn("slow_task", { taskId: "sweep" });

    expect(logger.lines).toEqual([
      { level: "warn", message: "slow_task", meta: { taskId: "sweep" } },
    ]);
  });

  test.each(["debug", "info", "warn", "error"] as const)(
    "satisfies an assertion at %s",
    (level) => {
      const logger = fakeLogger();

      logger[level]("dispatch_failed");

      expect(() => {
        logger.assertLogged(level, "dispatch_failed");
      }).not.toThrow();
    },
  );
});

describe("assertLogged", () => {
  test("fails for a message logged at another level, listing the lines logged", () => {
    const logger = fakeLogger();
    logger.warn("slow_task");

    expect(() => {
      logger.assertLogged("error", "slow_task");
    }).toThrow(
      'Expected "slow_task" to be logged at error, but it was not.\nLogged:\n  warn: slow_task',
    );
  });

  test("fails for a message that only contains the one asked for", () => {
    const logger = fakeLogger();
    logger.error("dispatch_failed: the forecast is down");

    expect(() => {
      logger.assertLogged("error", "dispatch_failed");
    }).toThrow('Expected "dispatch_failed" to be logged at error');
  });

  test("says nothing was logged when the site logged nothing", () => {
    const logger = fakeLogger();

    expect(() => {
      logger.assertLogged("error", "dispatch_failed");
    }).toThrow("Logged: nothing.");
  });
});

describe("assertNothingLogged", () => {
  test("passes when only other levels were logged", () => {
    const logger = fakeLogger();
    logger.info("served");

    expect(() => {
      logger.assertNothingLogged("error");
    }).not.toThrow();
  });

  test("fails for one line at that level", () => {
    const logger = fakeLogger();
    logger.warn("slow_task");

    expect(() => {
      logger.assertNothingLogged("warn");
    }).toThrow("Expected nothing to be logged at warn, but 1 line was.");
  });

  test("fails for several lines at that level, counting only them", () => {
    const logger = fakeLogger();
    logger.warn("slow_task");
    logger.warn("slow_task");
    logger.info("served");

    expect(() => {
      logger.assertNothingLogged("warn");
    }).toThrow("Expected nothing to be logged at warn, but 2 lines were.");
  });
});
