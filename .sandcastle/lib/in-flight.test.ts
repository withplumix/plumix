import { describe, expect, test } from "vitest";

import { stillInTheLoopsHands } from "./in-flight.js";

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
