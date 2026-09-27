import { describe, expect, test } from "vitest";

import { oncePerKey } from "./once-per-key.js";

describe("oncePerKey", () => {
  test("lanes asking about the same main share one survey", async () => {
    let surveys = 0;
    const survey = oncePerKey(async () => {
      surveys += 1;
      return ["test"];
    });

    const [a, b, c] = await Promise.all([
      survey("abc123"),
      survey("abc123"),
      survey("abc123"),
    ]);

    expect(surveys).toBe(1);
    expect(a).toEqual(["test"]);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  test("a main that moved is surveyed again", async () => {
    let surveys = 0;
    const survey = oncePerKey(async () => {
      surveys += 1;
      return [];
    });

    await survey("abc123");
    await survey("def456");

    expect(surveys).toBe(2);
  });

  test("a survey that throws is not remembered, so the next lane tries again", async () => {
    let surveys = 0;
    const survey = oncePerKey(async () => {
      surveys += 1;
      if (surveys === 1) throw new Error("sandbox died");
      return [];
    });

    await expect(survey("abc123")).rejects.toThrow("sandbox died");
    await expect(survey("abc123")).resolves.toEqual([]);
  });
});
