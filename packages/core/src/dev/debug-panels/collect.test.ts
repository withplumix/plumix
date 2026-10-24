import { describe, expect, test } from "vitest";

import type { DebugPanel } from "../../context/dev-runtime.js";
import { createDevRuntime } from "../../runtime/dev.js";
import { registerDevItem } from "../registrations.js";
import { collectDebugPanels } from "./collect.js";

function panel(id: string, order?: number): DebugPanel {
  return { id, title: id, order, render: () => null };
}

describe("collectDebugPanels", () => {
  test("returns an empty array when no panels are registered", () => {
    expect(collectDebugPanels(createDevRuntime(undefined))).toEqual([]);
  });

  test("orders panels by ascending `order`, unordered last", () => {
    const dev = createDevRuntime(undefined);
    registerDevItem(dev.debugPanels, "debug panel", panel("c", 30), null);
    registerDevItem(dev.debugPanels, "debug panel", panel("late"), null);
    registerDevItem(dev.debugPanels, "debug panel", panel("a", 10), null);
    registerDevItem(dev.debugPanels, "debug panel", panel("b", 20), null);

    expect(collectDebugPanels(dev).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
      "late",
    ]);
  });

  test("keeps registration order between panels of one `order`", () => {
    const dev = createDevRuntime(undefined);
    registerDevItem(dev.debugPanels, "debug panel", panel("first"), "one");
    registerDevItem(dev.debugPanels, "debug panel", panel("second"), "two");

    expect(collectDebugPanels(dev).map((p) => p.id)).toEqual([
      "first",
      "second",
    ]);
  });

  test("omits panels config turns off in `dev.panels`", () => {
    const dev = createDevRuntime({ panels: { timeline: false } });
    registerDevItem(dev.debugPanels, "debug panel", panel("request", 10), null);
    registerDevItem(
      dev.debugPanels,
      "debug panel",
      panel("timeline", 20),
      null,
    );

    expect(collectDebugPanels(dev).map((p) => p.id)).toEqual(["request"]);
  });
});
