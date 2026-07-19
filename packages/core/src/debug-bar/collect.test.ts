import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { DebugPanel } from "./types.js";
import { HookRegistry } from "../hooks/registry.js";
import { collectDebugPanels } from "./collect.js";

// collect passes ctx opaquely to handlers; these tests never read it.
const ctx = {} as AppContext;
const none: ReadonlySet<string> = new Set();

function panel(id: string, order?: number): DebugPanel {
  return { id, title: id, order, render: () => null };
}

describe("collectDebugPanels", () => {
  test("returns an empty array when no panels are registered", () => {
    const hooks = new HookRegistry();

    expect(collectDebugPanels(hooks, ctx, none)).toEqual([]);
  });

  test("returns panels contributed through the filter", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      panel("request"),
    ]);

    expect(collectDebugPanels(hooks, ctx, none).map((p) => p.id)).toEqual([
      "request",
    ]);
  });

  test("orders panels by ascending `order`, unordered last", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      panel("c", 30),
      panel("late"),
      panel("a", 10),
      panel("b", 20),
    ]);

    expect(collectDebugPanels(hooks, ctx, none).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
      "late",
    ]);
  });

  test("omits panels whose id is in the disabled denylist", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      panel("request", 10),
      panel("timeline", 20),
    ]);

    const ids = collectDebugPanels(hooks, ctx, new Set(["timeline"])).map(
      (p) => p.id,
    );

    expect(ids).toEqual(["request"]);
  });

  test("isolates a handler that throws so other panels survive", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      panel("a", 10),
    ]);
    hooks.addFilter("debug_bar:panels", () => {
      throw new Error("boom");
    });
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      panel("b", 20),
    ]);

    expect(collectDebugPanels(hooks, ctx, none).map((p) => p.id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("dedupes by id — last contributor wins", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("debug_bar:panels", (panels) => [
      ...panels,
      { id: "request", title: "first", order: 10, render: () => null },
      { id: "request", title: "second", order: 10, render: () => null },
    ]);

    const result = collectDebugPanels(hooks, ctx, none);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("second");
  });
});
