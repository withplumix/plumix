import { describe, expect, test, vi } from "vitest";

import type { PlumixIslandElement } from "../island-element.js";
import { onlyStrategy } from "./only.js";

const EL = {} as PlumixIslandElement;

describe("onlyStrategy", () => {
  test("hydrates immediately on connect (the empty shell renders client-side)", () => {
    const loadFn = vi.fn(() => Promise.resolve());
    void onlyStrategy(loadFn, {}, EL);
    expect(loadFn).toHaveBeenCalledTimes(1);
  });
});
