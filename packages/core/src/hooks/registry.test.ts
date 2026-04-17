import { describe, expect, test, vi } from "vitest";

import { HookRegistry } from "./registry.js";

// Augment the empty registries with test-only hook names so the real type
// machinery (FilterInput / ActionArgs extraction) is exercised end-to-end.
declare module "./types.js" {
  interface FilterRegistry {
    "test:pipeline": (value: { readonly count: number }) => {
      readonly count: number;
    };
    "test:passthrough": (value: string) => string;
    "test:with_rest": (value: number, multiplier: number) => number;
  }
  interface ActionRegistry {
    "test:fired": () => void;
    "test:args": (userId: number, detail: string) => void;
    "test:throws": () => void;
  }
}

describe("applyFilter", () => {
  test("returns input unchanged when no filters are registered", async () => {
    const registry = new HookRegistry();
    const result = await registry.applyFilter("test:passthrough", "unchanged");
    expect(result).toBe("unchanged");
  });

  test("runs filters in priority order (lower first), stable on ties", async () => {
    const registry = new HookRegistry();
    const order: string[] = [];
    registry.addFilter(
      "test:passthrough",
      (v) => {
        order.push("b100-first");
        return v + "-b";
      },
      { priority: 100 },
    );
    registry.addFilter(
      "test:passthrough",
      (v) => {
        order.push("a50");
        return v + "-a";
      },
      { priority: 50 },
    );
    registry.addFilter(
      "test:passthrough",
      (v) => {
        order.push("b100-second");
        return v + "-c";
      },
      { priority: 100 },
    );
    const result = await registry.applyFilter("test:passthrough", "start");
    expect(order).toEqual(["a50", "b100-first", "b100-second"]);
    expect(result).toBe("start-a-b-c");
  });

  test("cloning shields the caller's input from in-filter mutation", async () => {
    const registry = new HookRegistry();
    registry.addFilter("test:pipeline", (value) => {
      // Filter mutates the argument it received.
      (value as { count: number }).count = 999;
      return value;
    });

    const input = { count: 1 };
    await registry.applyFilter("test:pipeline", input);
    // Caller's original object is untouched — the filter operated on a clone.
    expect(input.count).toBe(1);
  });

  test("threads extra positional args to every filter", async () => {
    const registry = new HookRegistry();
    registry.addFilter("test:with_rest", (v, mul) => v * mul);
    registry.addFilter("test:with_rest", (v, mul) => v + mul);
    const out = await registry.applyFilter("test:with_rest", 3, 10);
    expect(out).toBe(40); // (3 * 10) + 10
  });
});

describe("doAction", () => {
  test("invokes all handlers even if one throws", async () => {
    const registry = new HookRegistry({
      onActionFailure: () => {
        /* swallow for this test */
      },
    });
    const fired = vi.fn();
    registry.addAction("test:throws", () => {
      throw new Error("boom");
    });
    registry.addAction("test:throws", fired);
    await registry.doAction("test:throws");
    expect(fired).toHaveBeenCalledTimes(1);
  });

  test("passes positional args through", async () => {
    const registry = new HookRegistry();
    const handler = vi.fn();
    registry.addAction("test:args", handler);
    await registry.doAction("test:args", 42, "hello");
    expect(handler).toHaveBeenCalledWith(42, "hello");
  });

  test("reports failed actions via onActionFailure with plugin and hook", async () => {
    const failure = vi.fn();
    const registry = new HookRegistry({ onActionFailure: failure });
    registry.addAction(
      "test:throws",
      () => {
        throw new Error("boom");
      },
      { plugin: "seo" },
    );
    await registry.doAction("test:throws");
    expect(failure).toHaveBeenCalledTimes(1);
    expect(failure.mock.calls[0]?.[0]).toMatchObject({
      hook: "test:throws",
      plugin: "seo",
    });
  });
});
