import { describe, expect, test } from "vitest";

import type { DevErrorFrame } from "@plumix/blocks/dev-error";

import type { RetainedClientError } from "./client-error-ring.js";
import { createClientErrorRing } from "./client-error-ring.js";

function frame(over: Partial<DevErrorFrame> = {}): DevErrorFrame {
  return {
    file: "/proj/src/Counter.tsx",
    line: 14,
    column: 20,
    isVendor: false,
    ...over,
  };
}

function retained(
  over: Partial<RetainedClientError> = {},
): RetainedClientError {
  return {
    source: "client",
    level: "error",
    message: "boom",
    stack: [frame()],
    ...over,
  };
}

describe("createClientErrorRing — ring buffer", () => {
  test("never exceeds N and drops the oldest on insert", () => {
    const ring = createClientErrorRing({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      ring.add(retained({ message: `boom-${i}` }));
    }

    const messages = ring.get().map((e) => e.message);
    // Newest-first, capped at 3, the two oldest evicted.
    expect(messages).toEqual(["boom-4", "boom-3", "boom-2"]);
  });

  test("get() returns entries newest-first", () => {
    const ring = createClientErrorRing();
    ring.add(retained({ message: "a" }));
    ring.add(retained({ message: "b" }));
    ring.add(retained({ message: "c" }));

    expect(ring.get().map((e) => e.message)).toEqual(["c", "b", "a"]);
  });

  test("preserves source, level, message, resolved stack, and label", () => {
    const ring = createClientErrorRing();
    ring.add(
      retained({
        level: "warn",
        message: "render boom",
        label: "<Counter>",
        stack: [frame({ functionName: "Counter" })],
      }),
    );

    const [entry] = ring.get();
    expect(entry).toEqual({
      source: "client",
      level: "warn",
      message: "render boom",
      label: "<Counter>",
      stack: [frame({ functionName: "Counter" })],
    });
  });

  test("omits an absent label rather than storing undefined", () => {
    const ring = createClientErrorRing();
    ring.add(retained());

    expect(ring.get()[0]).not.toHaveProperty("label");
  });
});

describe("createClientErrorRing — payload bounding", () => {
  test("truncates an oversized message", () => {
    const ring = createClientErrorRing({ maxStringLength: 10 });
    ring.add(retained({ message: "x".repeat(1_000) }));

    const message = ring.get()[0]?.message ?? "";
    expect(message.length).toBeLessThan(50);
    expect(message).toMatch(/truncated/);
  });

  test("truncates an oversized frame path", () => {
    const ring = createClientErrorRing({ maxStringLength: 10 });
    ring.add(
      retained({ stack: [frame({ file: "/proj/" + "z".repeat(1_000) })] }),
    );

    const file = ring.get()[0]?.stack[0]?.file ?? "";
    expect(file.length).toBeLessThan(50);
    expect(file).toMatch(/truncated/);
  });

  test("evicts oldest past the total byte budget but always keeps the newest", () => {
    // A single big entry dwarfs the budget; the newest must survive alone.
    const big = "y".repeat(5_000);
    const ring = createClientErrorRing({
      maxEntries: 10,
      maxTotalBytes: 2_000,
      maxStringLength: 10_000,
    });

    ring.add(retained({ message: `a-${big}` }));
    ring.add(retained({ message: `b-${big}` }));

    const messages = ring.get().map((e) => e.message);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.startsWith("b-")).toBe(true);
  });
});
