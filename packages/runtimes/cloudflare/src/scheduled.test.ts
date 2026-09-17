import type { Mock } from "vitest";
import { describe, expect, test, vi } from "vitest";

import { surfaceScheduledFailure } from "./scheduled.js";

/** The controller Workers passes as `scheduled`'s first argument. */
function firing(cron = "0 3 * * *"): {
  controller: ScheduledController;
  noRetry: Mock<() => void>;
} {
  const noRetry = vi.fn<() => void>();
  return { controller: { scheduledTime: 0, cron, noRetry }, noRetry };
}

describe("surfaceScheduledFailure", () => {
  test("resolves when the adapter reported nothing", () => {
    const { controller, noRetry } = firing();
    expect(() => {
      surfaceScheduledFailure(undefined, controller);
    }).not.toThrow();
    expect(noRetry).not.toHaveBeenCalled();
  });

  test("resolves when every task ran", () => {
    const { controller, noRetry } = firing();
    expect(() => {
      surfaceScheduledFailure({ ran: 2, failed: [] }, controller);
    }).not.toThrow();
    expect(noRetry).not.toHaveBeenCalled();
  });

  test("throws when the run never started, naming the reason and the schedule", () => {
    const { controller } = firing("*/5 * * * *");
    expect(() => {
      surfaceScheduledFailure(
        { ran: 0, failed: [], aborted: 'D1 binding "DB" missing from env' },
        controller,
      );
    }).toThrow(/\*\/5 \* \* \* \*.*never started.*D1 binding "DB" missing/s);
  });

  test("leaves the platform retry in place for a run that never started", () => {
    const { controller, noRetry } = firing();
    expect(() => {
      surfaceScheduledFailure(
        { ran: 0, failed: [], aborted: "no database" },
        controller,
      );
    }).toThrow();
    expect(noRetry).not.toHaveBeenCalled();
  });

  test("throws when a task failed, naming every one and the schedule", () => {
    const { controller } = firing();
    expect(() => {
      surfaceScheduledFailure(
        { ran: 1, failed: ["blog:publish-scheduled", "og:warm-cards"] },
        controller,
      );
    }).toThrow(
      /0 3 \* \* \*.*2 task\(s\) failed.*blog:publish-scheduled, og:warm-cards/s,
    );
  });

  test("declines the platform retry when the firing partly succeeded", () => {
    const { controller, noRetry } = firing();
    expect(() => {
      surfaceScheduledFailure({ ran: 1, failed: ["blog:publish"] }, controller);
    }).toThrow();
    expect(noRetry).toHaveBeenCalledTimes(1);
  });

  test("leaves the platform retry in place when every task failed", () => {
    const { controller, noRetry } = firing();
    expect(() => {
      surfaceScheduledFailure(
        { ran: 0, failed: ["blog:publish", "og:warm"] },
        controller,
      );
    }).toThrow();
    // Nothing succeeded, so a replay duplicates nothing — the same reason an
    // aborted run keeps its retry.
    expect(noRetry).not.toHaveBeenCalled();
  });
});
