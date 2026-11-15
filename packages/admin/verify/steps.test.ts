import { describe, expect, it } from "vitest";

import type { Expect } from "./steps.js";
import { runSteps } from "./steps.js";

describe("runSteps", () => {
  it("counts each assertion that holds as a passed step", async () => {
    const outcome = await runSteps(async (assert) => {
      assert(1).toBe(1);
      await assert(Promise.resolve("Copied")).resolves.toBe("Copied");
    }, "steps.png");

    expect(outcome).toEqual({ passed: 2, failed: [] });
  });

  it.each([
    ["a negated assertion", (assert: Expect) => assert(1).not.toBe(2)],
    ["a soft assertion", (assert: Expect) => assert.soft(1).toBe(1)],
    ["a polled assertion", (assert: Expect) => assert.poll(() => 1).toBe(1)],
    [
      "an assertion of a configured expect",
      (assert: Expect) => assert.configure({ timeout: 1000 })(1).toBe(1),
    ],
  ])("counts %s that holds as a passed step", async (_, step) => {
    const outcome = await runSteps(step, "steps.png");

    expect(outcome).toEqual({ passed: 1, failed: [] });
  });

  it("stops at the first assertion that fails and reports it with the screenshot", async () => {
    const outcome = await runSteps((assert) => {
      assert("Copy").toBe("Copy");
      assert("Copy").toBe("Copied");
      assert("Copied").toBe("Copied");
    }, "steps.png");

    expect(outcome).toMatchObject({
      passed: 1,
      failed: [{ screenshot: "steps.png" }],
    });
    expect(outcome.failed[0]?.message).toContain(
      'Expected: "Copied"\nReceived: "Copy"',
    );
  });

  it("reports a failure without the terminal colours Playwright gives it", async () => {
    const outcome = await runSteps(() => {
      throw new Error(
        "\u001b[2mlocator.click:\u001b[22m Timeout \u001b[31m5000ms\u001b[39m exceeded.",
      );
    }, "steps.png");

    expect(outcome.failed).toEqual([
      {
        message: "locator.click: Timeout 5000ms exceeded.",
        screenshot: "steps.png",
      },
    ]);
  });

  it("reports a thrown value that is not an Error by its text", async () => {
    const outcome = await runSteps(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a step file may throw anything
      throw "Run with --seed: no media to open.";
    }, "steps.png");

    expect(outcome.failed).toEqual([
      {
        message: "Run with --seed: no media to open.",
        screenshot: "steps.png",
      },
    ]);
  });
});
