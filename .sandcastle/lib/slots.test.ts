import { describe, expect, test } from "vitest";

import { slotsFor } from "./slots.js";

const heldUntilReleased = () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
};

describe("slotsFor", () => {
  test("work queued for a slot starts in the order it asked", async () => {
    const slots = slotsFor(1);
    const started: string[] = [];
    const first = heldUntilReleased();

    const running = slots.run(() => first.held);
    const queued = ["a", "b"].map((name) =>
      slots.run(async () => {
        started.push(name);
      }),
    );
    first.release();
    await Promise.all([running, ...queued]);

    expect(started).toEqual(["a", "b"]);
  });

  test("work run first takes the next free slot ahead of work that asked earlier", async () => {
    const slots = slotsFor(1);
    const started: string[] = [];
    const first = heldUntilReleased();

    const running = slots.run(() => first.held);
    const ticket = slots.run(async () => {
      started.push("ticket");
    });
    const repair = slots.runFirst(async () => {
      started.push("repair");
    });
    first.release();
    await Promise.all([running, ticket, repair]);

    expect(started).toEqual(["repair", "ticket"]);
  });

  test("two pieces of work run first keep the order they asked in", async () => {
    const slots = slotsFor(1);
    const started: string[] = [];
    const first = heldUntilReleased();

    const running = slots.run(() => first.held);
    const repairs = ["earlier", "later"].map((name) =>
      slots.runFirst(async () => {
        started.push(name);
      }),
    );
    first.release();
    await Promise.all([running, ...repairs]);

    expect(started).toEqual(["earlier", "later"]);
  });

  test("work run first starts at once while a slot is free", async () => {
    const slots = slotsFor(2);
    const first = heldUntilReleased();

    const running = slots.run(() => first.held);
    let started = false;
    await slots.runFirst(async () => {
      started = true;
    });
    first.release();
    await running;

    expect(started).toBe(true);
  });
});
