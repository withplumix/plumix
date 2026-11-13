import { describe, expect, test } from "vitest";

import { recoverDeliveries } from "./recovery.js";

describe("recoverDeliveries", () => {
  test("an open PR from before journaling is adopted once even if its issue has a pending branch record", () => {
    const queued = {
      ticket: { number: 3450, title: "fix saving" },
      pullRequest: { number: 3501, url: "pr/3501" },
    };

    const recovered = recoverDeliveries(
      [
        {
          ticket: queued.ticket,
          branch: "feat/fix-saving-3450",
          repairs: 0,
          rebases: 0,
        },
      ],
      [queued, queued],
      () => undefined,
    );

    expect(recovered).toEqual({ inFlight: [queued], interrupted: [] });
  });

  test("a run named for some tickets still watches every PR the loop opened, and resumes only the named work", () => {
    const earlierPullRequest = {
      ticket: { number: 3522, title: "useId mismatch" },
      pullRequest: { number: 3630, url: "pr/3630" },
    };
    const unnamedWork = {
      ticket: { number: 3500, title: "unnamed" },
      branch: "feat/unnamed-3500",
      repairs: 0,
      rebases: 0,
    };
    const namedWork = {
      ticket: { number: 3529, title: "named" },
      branch: "feat/named-3529",
      repairs: 0,
      rebases: 0,
    };

    const recovered = recoverDeliveries(
      [unnamedWork, namedWork],
      [earlierPullRequest],
      () => undefined,
      (ticket) => ticket === 3529,
    );

    expect(recovered).toEqual({
      inFlight: [earlierPullRequest],
      interrupted: [namedWork],
    });
  });

  test("interrupted work without a PR is held instead of being handed out for a fresh implementation", () => {
    const delivery = {
      ticket: { number: 3450, title: "fix saving" },
      branch: "feat/fix-saving-3450",
      repairs: 0,
      rebases: 0,
    };

    const recovered = recoverDeliveries([delivery], [], () => undefined);

    expect(recovered).toEqual({ inFlight: [], interrupted: [delivery] });
  });

  test("a PR created before the last journal write is found by its recorded branch", () => {
    const recovered = recoverDeliveries(
      [
        {
          ticket: { number: 3450, title: "fix saving" },
          branch: "feat/fix-saving-3450",
          repairs: 0,
          rebases: 0,
        },
      ],
      [],
      (branch) =>
        branch === "feat/fix-saving-3450"
          ? { number: 3501, url: "pr/3501" }
          : undefined,
    );

    expect(recovered.inFlight).toEqual([
      {
        ticket: { number: 3450, title: "fix saving" },
        pullRequest: { number: 3501, url: "pr/3501" },
      },
    ]);
  });

  test("a recorded PR is recovered even when GitHub no longer lists it as open", () => {
    const recovered = recoverDeliveries(
      [
        {
          ticket: { number: 3450, title: "fix saving" },
          pullRequest: { number: 3501, url: "pr/3501" },
          repairs: 1,
          rebases: 0,
        },
      ],
      [],
      () => undefined,
    );

    expect(recovered).toEqual({
      inFlight: [
        {
          ticket: { number: 3450, title: "fix saving" },
          pullRequest: { number: 3501, url: "pr/3501" },
        },
      ],
      interrupted: [],
    });
  });
});
