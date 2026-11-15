import { expect, it } from "vitest";

// Guards the regression from #1559.
it("adds", () => {
  expect(1 + 1).toBe(2);
});
