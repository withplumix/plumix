import { describe, expect, test } from "vitest";

import { staleClaims, stillInTheLoopsHands } from "./in-flight.js";

const pr = (number: number, headRefName: string) => ({
  number,
  url: `https://github.com/o/r/pull/${number}`,
  headRefName,
});
const issue = (
  number: number,
  over: Partial<{ state: string; labels: string[] }> = {},
) => ({
  number,
  title: `t${number}`,
  state: "OPEN",
  labels: ["ready-for-agent"],
  ...over,
});

describe("stillInTheLoopsHands", () => {
  test("a loop branch whose ticket is still ready for the loop is picked up", () => {
    expect(
      stillInTheLoopsHands(
        [pr(2673, "feat/a-blob-rpc-round-trip-2432")],
        [issue(2432)],
      ),
    ).toEqual([
      {
        ticket: { number: 2432, title: "t2432" },
        pullRequest: { number: 2673, url: "https://github.com/o/r/pull/2673" },
      },
    ]);
  });

  test.each([
    [
      "a pull request a person opened",
      pr(2658, "chore/ship-lanes-wait-2658"),
      issue(2658),
    ],
    [
      "a ticket parked for a person",
      pr(2705, "feat/config-slot-2471"),
      issue(2471, { labels: ["ready-for-human"] }),
    ],
    [
      "a ticket already closed",
      pr(2705, "feat/config-slot-2471"),
      issue(2471, { state: "CLOSED" }),
    ],
  ])("%s is left alone", (_, pullRequest, ticket) => {
    expect(stillInTheLoopsHands([pullRequest], [ticket])).toEqual([]);
  });

  test("a ticket an ended run released is still picked up, so its pull request is not shipped over", () => {
    expect(
      stillInTheLoopsHands([pr(2720, "feat/bun-runtime-2685")], [issue(2685)]),
    ).toHaveLength(1);
  });
});

describe("staleClaims", () => {
  const queued = (ticket: number) => ({
    ticket: { number: ticket, title: `t${ticket}` },
    pullRequest: { number: 100 + ticket, url: `pr/${ticket}` },
  });

  test("a claimed ticket with no pull request in flight was left by a run that stopped mid-ticket", () => {
    expect(staleClaims([2748, 2737, 2726], [queued(2726)])).toEqual([
      2748, 2737,
    ]);
  });

  test("a claim whose pull request is still in flight is kept, so the run adopts it", () => {
    expect(staleClaims([2726], [queued(2726)])).toEqual([]);
  });
});
