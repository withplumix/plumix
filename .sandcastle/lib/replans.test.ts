import { describe, expect, test } from "vitest";

import type { ShipEvent } from "./ship-history.js";
import { replanning, REPLANS_A_TICKET_GETS } from "./replans.js";

const journalWith = (replans: number) => {
  const recorded: ShipEvent[] = [];
  return {
    recorded,
    history: {
      replans: () =>
        Array.from({ length: replans + recorded.length }, () => ({
          reason: "r",
          decision: "d",
        })),
      record: (event: ShipEvent) => {
        recorded.push(event);
      },
    },
  };
};

describe("replanning", () => {
  test("a decision amends the brief and is journaled, so a restart remembers it", async () => {
    const { history, recorded } = journalWith(0);

    const decision = await replanning(
      history,
      42,
      async () => "the ADR settles it",
    )("which page?");

    expect(decision).toBe("the ADR settles it");
    expect(recorded).toEqual([
      {
        type: "brief.amended",
        issue: 42,
        reason: "which page?",
        decision: "the ADR settles it",
      },
    ]);
  });

  test("a stop inside the review loop and one after it share the ticket's re-plans", async () => {
    const { history } = journalWith(REPLANS_A_TICKET_GETS - 1);
    const decide = replanning(history, 42, async () => "settled");

    expect(await decide("first")).toBe("settled");
    expect(await decide("second")).toBeNull();
  });

  test("a question the documents leave to a person is not journaled", async () => {
    const { history, recorded } = journalWith(0);

    expect(
      await replanning(history, 42, async () => null)("secret?"),
    ).toBeNull();
    expect(recorded).toEqual([]);
  });
});
