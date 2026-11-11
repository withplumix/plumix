import { expect, test } from "vitest";

import { analyseBeforeSetup } from "./analysis.js";

test("a blocked analysis never installs dependencies or builds", async () => {
  const calls: string[] = [];
  const result = await analyseBeforeSetup({
    analyse: async () => {
      calls.push("analyse");
      return { next: "park" as const, reason: "needs a decision" };
    },
    setup: async () => {
      calls.push("setup");
    },
  });
  expect(calls).toEqual(["analyse"]);
  expect(result.next).toBe("park");
});
