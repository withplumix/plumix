import { describe, expect, test, vi } from "vitest";

import type { FilterFn } from "./types.js";
import { HookExecutionError } from "./errors.js";
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
    "test:isolated": (
      value: readonly number[],
      bump: number,
    ) => readonly number[];
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

describe("applyFilterSync", () => {
  test("returns input unchanged when no filters are registered", () => {
    const registry = new HookRegistry();
    const result = registry.applyFilterSync("test:passthrough", "unchanged");
    expect(result).toBe("unchanged");
  });

  test("runs filters in priority order (lower first), stable on ties", () => {
    const registry = new HookRegistry();
    registry.addFilter("test:passthrough", (v) => v + "-b", { priority: 100 });
    registry.addFilter("test:passthrough", (v) => v + "-a", { priority: 50 });
    registry.addFilter("test:passthrough", (v) => v + "-c", { priority: 100 });
    const result = registry.applyFilterSync("test:passthrough", "start");
    expect(result).toBe("start-a-b-c");
  });

  test("rejects a non-Promise thenable too (anything with `.then`)", () => {
    const registry = new HookRegistry();
    const thenable = (() => ({
      then() {
        /* never called — sync path must reject before invoking */
      },
    })) as unknown as FilterFn<"test:passthrough">;
    registry.addFilter("test:passthrough", thenable);
    expect(() => registry.applyFilterSync("test:passthrough", "x")).toThrow(
      HookExecutionError,
    );
  });

  test("rejects an async handler registered against a sync invocation", () => {
    const registry = new HookRegistry();
    // The misuse: a filter signature whose return is `string`, but the
    // registered handler returns `Promise<string>`. Sync path must reject
    // at the call site instead of leaking a rejected value downstream.
    const asyncMisuse = ((v: string) =>
      Promise.resolve(v)) as unknown as FilterFn<"test:passthrough">;
    registry.addFilter("test:passthrough", asyncMisuse);
    expect(() => registry.applyFilterSync("test:passthrough", "x")).toThrow(
      HookExecutionError,
    );
  });
});

describe("applyFilterIsolated", () => {
  test("returns the seed unchanged when no filters are registered", () => {
    const registry = new HookRegistry();
    const seed = [1, 2];
    expect(registry.applyFilterIsolated("test:isolated", seed, 0)).toBe(seed);
  });

  test("accumulates through handlers in priority order", () => {
    const registry = new HookRegistry();
    registry.addFilter("test:isolated", (v) => [...v, 100], { priority: 100 });
    registry.addFilter("test:isolated", (v) => [...v, 50], { priority: 50 });
    expect(registry.applyFilterIsolated("test:isolated", [], 0)).toEqual([
      50, 100,
    ]);
  });

  test("passes rest args to each handler", () => {
    const registry = new HookRegistry();
    registry.addFilter("test:isolated", (v, bump) => [...v, bump]);
    registry.addFilter("test:isolated", (v, bump) => [...v, bump * 2]);
    expect(registry.applyFilterIsolated("test:isolated", [], 7)).toEqual([
      7, 14,
    ]);
  });

  test("isolates a throwing handler so later handlers still run", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      /* silence */
    });
    try {
      const registry = new HookRegistry();
      registry.addFilter("test:isolated", (v) => [...v, 1], { plugin: "a" });
      registry.addFilter(
        "test:isolated",
        () => {
          throw new Error("boom");
        },
        { plugin: "blowup" },
      );
      registry.addFilter("test:isolated", (v) => [...v, 2], { plugin: "b" });

      expect(registry.applyFilterIsolated("test:isolated", [], 0)).toEqual([
        1, 2,
      ]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain("test:isolated");
      expect(errorSpy.mock.calls[0]?.[0]).toContain("plugin=blowup");
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("discards a non-array return and continues with the prior state", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      /* silence */
    });
    try {
      const registry = new HookRegistry();
      registry.addFilter("test:isolated", (v) => [...v, 1], { plugin: "a" });
      registry.addFilter(
        "test:isolated",
        (() => "nope") as unknown as FilterFn<"test:isolated">,
        { plugin: "bad" },
      );
      registry.addFilter("test:isolated", (v) => [...v, 2], { plugin: "b" });

      expect(registry.applyFilterIsolated("test:isolated", [], 0)).toEqual([
        1, 2,
      ]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain("non-array");
      expect(errorSpy.mock.calls[0]?.[0]).toContain("plugin=bad");
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("labels a pluginless handler as core in the error message", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      /* silence */
    });
    try {
      const registry = new HookRegistry();
      registry.addFilter("test:isolated", () => {
        throw new Error("boom");
      });

      registry.applyFilterIsolated("test:isolated", [], 0);
      expect(errorSpy.mock.calls[0]?.[0]).toContain("plugin=core");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("getFilterHandlers", () => {
  test("returns an empty array when no filters are registered", () => {
    const registry = new HookRegistry();
    expect(registry.getFilterHandlers("test:passthrough")).toEqual([]);
  });

  test("returns handlers sorted by priority (lower first) then insertion order", () => {
    const registry = new HookRegistry();
    const fnB = (v: string) => v + "-b";
    const fnA = (v: string) => v + "-a";
    const fnC = (v: string) => v + "-c";
    registry.addFilter("test:passthrough", fnB, {
      priority: 100,
      plugin: "b",
    });
    registry.addFilter("test:passthrough", fnA, { priority: 50, plugin: "a" });
    registry.addFilter("test:passthrough", fnC, {
      priority: 100,
      plugin: "c",
    });

    const [first, ...rest] = registry.getFilterHandlers("test:passthrough");
    if (!first) throw new Error("expected at least one handler");

    expect(first.plugin).toBe("a");
    expect(first.fn("start")).toBe("start-a");
    expect(rest.map((h) => h.plugin)).toEqual(["b", "c"]);
  });

  test("plugin is null when handler is registered without one", () => {
    const registry = new HookRegistry();
    registry.addFilter("test:passthrough", (v) => v);

    const [first] = registry.getFilterHandlers("test:passthrough");
    if (!first) throw new Error("expected at least one handler");

    expect(first.plugin).toBeNull();
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
