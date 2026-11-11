import { expect, test } from "vitest";

import { readShipCommand } from "./ship-options.js";

test("a mistyped operator command cannot start live delivery", () => {
  expect(() => readShipCommand(["--stats"])).toThrow();
  expect(() => readShipCommand(["--lanes=NaN"])).toThrow();
  expect(() => readShipCommand(["--status", "--drain"])).toThrow();
  expect(readShipCommand(["3450", "--lanes=1", "--hours=4"])).toMatchObject({
    mode: "run",
    onlyTickets: [3450],
    lanes: 1,
    budgetMs: 14_400_000,
  });
});
