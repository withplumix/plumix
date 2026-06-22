import { describe, expect, test } from "vitest";

import { defineBlock } from "@plumix/blocks";

import { buildEditorRegistry } from "./runtime.js";

describe("buildEditorRegistry", () => {
  test("includes core blocks even with no plugin specs", () => {
    const registry = buildEditorRegistry();
    expect(registry.has("core/heading")).toBe(true);
  });

  test("adds plugin block specs alongside core", () => {
    const widget = defineBlock({ name: "acme/widget", render: () => null });
    const registry = buildEditorRegistry([widget]);
    expect(registry.has("core/heading")).toBe(true);
    expect(registry.has("acme/widget")).toBe(true);
  });

  test("a plugin spec overrides a core block of the same name (last write wins)", () => {
    const override = defineBlock({ name: "core/heading", render: () => null });
    const registry = buildEditorRegistry([override]);
    expect(registry.get("core/heading")).toBe(override);
  });
});
