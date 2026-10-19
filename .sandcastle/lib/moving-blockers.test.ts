import { describe, expect, test } from "vitest";

import { someTicketWaitsOnAMovingBlocker } from "./moving-blockers.js";

const open = (openPullRequests: number) => ({
  state: "OPEN",
  openPullRequests,
});

describe("someTicketWaitsOnAMovingBlocker", () => {
  test("a ticket whose open blocker has an open pull request is waiting on something moving", () => {
    expect(
      someTicketWaitsOnAMovingBlocker(
        [{ number: 7, assigned: false, blockedBy: [open(0), open(1)] }],
        new Set(),
      ),
    ).toBe(true);
  });

  test("an open pull request on a blocker that is already closed moves nothing", () => {
    expect(
      someTicketWaitsOnAMovingBlocker(
        [
          {
            number: 7,
            assigned: false,
            blockedBy: [{ state: "CLOSED", openPullRequests: 1 }],
          },
        ],
        new Set(),
      ),
    ).toBe(false);
  });

  test.each([
    ["assigned to someone", { assigned: true }, new Set<number>()],
    ["already taken by this run", { assigned: false }, new Set([7])],
  ])("a ticket %s keeps no lane waiting", (_, { assigned }, alreadyTaken) => {
    expect(
      someTicketWaitsOnAMovingBlocker(
        [{ number: 7, assigned, blockedBy: [open(1)] }],
        alreadyTaken,
      ),
    ).toBe(false);
  });
});
