import { describe, expect, test, vi } from "vitest";

import { singleFlight } from "./single-flight.js";

/** A call that stays pending until the test settles it. */
function pendingCall() {
  let settle: (value: string) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  const fn = vi.fn(
    (input: string) =>
      new Promise<string>((resolve, reject) => {
        settle = (value) => {
          resolve(`${input}:${value}`);
        };
        fail = reject;
      }),
  );
  return {
    fn,
    settle: (value: string) => {
      settle(value);
    },
    fail: (reason: Error) => {
      fail(reason);
    },
  };
}

describe("singleFlight", () => {
  test("answers a call made while the first is pending with null, without running it", async () => {
    const call = pendingCall();
    const guarded = singleFlight(call.fn);
    const first = guarded("a");

    const second = guarded("b");
    call.settle("done");

    await expect(second).resolves.toBeNull();
    expect(call.fn).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe("a:done");
  });

  test("runs a call made after the first has settled", async () => {
    const call = pendingCall();
    const guarded = singleFlight(call.fn);
    const first = guarded("a");
    call.settle("done");
    await first;

    const second = guarded("b");
    call.settle("again");

    await expect(second).resolves.toBe("b:again");
    expect(call.fn).toHaveBeenCalledTimes(2);
  });

  test("runs a call made after the first was rejected", async () => {
    const call = pendingCall();
    const guarded = singleFlight(call.fn);
    const first = guarded("a");
    call.fail(new Error("offline"));
    await expect(first).rejects.toThrow("offline");

    const second = guarded("b");
    call.settle("again");

    await expect(second).resolves.toBe("b:again");
  });
});
