import { describe, expect, test } from "vitest";

import { loadOnce } from "./load-once.js";

describe("loadOnce", () => {
  test("concurrent calls share one promise and run the factory once", async () => {
    let runs = 0;
    const load = loadOnce(() => {
      runs += 1;
      return Promise.resolve({ runs });
    });

    const [first, second] = [load(), load()];

    expect(second).toBe(first);
    expect(await load()).toBe(await first);
    expect(runs).toBe(1);
  });

  test("a rejected load runs the factory again on the next call", async () => {
    let runs = 0;
    const load = loadOnce(() => {
      runs += 1;
      return runs === 1
        ? Promise.reject(new Error("chunk failed to load"))
        : Promise.resolve("loaded");
    });

    await expect(load()).rejects.toThrow("chunk failed to load");

    expect(await load()).toBe("loaded");
    expect(runs).toBe(2);
  });
});
