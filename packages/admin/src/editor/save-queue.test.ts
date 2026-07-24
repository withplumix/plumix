import { describe, expect, test } from "vitest";

import { createSaveQueue } from "./save-queue.js";

// A controllable async task: exposes when it started and a `resolve`/`reject`
// the test drives so overlap can be observed deterministically.
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveQueue", () => {
  test("runs a single task and resolves with its result", async () => {
    const queue = createSaveQueue();
    await expect(queue.run(() => Promise.resolve(42))).resolves.toBe(42);
  });

  test("never runs two tasks concurrently — the second starts only after the first settles", async () => {
    const queue = createSaveQueue();
    const events: string[] = [];
    const first = deferred();

    const a = queue.run(async () => {
      events.push("a:start");
      await first.promise;
      events.push("a:end");
    });
    // Enqueue b while a is mid-flight.
    const b = queue.run(async () => {
      events.push("b:start");
    });

    // a has started; b must NOT have started while a is still running.
    await Promise.resolve();
    expect(events).toEqual(["a:start"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(events).toEqual(["a:start", "a:end", "b:start"]);
  });

  test("preserves FIFO order across many enqueues", async () => {
    const queue = createSaveQueue();
    const order: number[] = [];
    const runs = [0, 1, 2, 3, 4].map((n) =>
      queue.run(async () => {
        await Promise.resolve();
        order.push(n);
      }),
    );
    await Promise.all(runs);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  test("a rejecting task rejects its own run but does not stall the queue", async () => {
    const queue = createSaveQueue();
    const ran: string[] = [];

    const failing = queue.run(async () => {
      ran.push("fail");
      throw new Error("boom");
    });
    const next = queue.run(async () => {
      ran.push("next");
      return "ok";
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(ran).toEqual(["fail", "next"]);
  });

  test("a task enqueued after the queue drained runs immediately", async () => {
    const queue = createSaveQueue();
    await queue.run(() => Promise.resolve());
    const order: string[] = [];
    await queue.run(async () => {
      order.push("late");
    });
    expect(order).toEqual(["late"]);
  });
});
