import { describe, expect, test } from "vitest";

import { defineBlock, defineShortcode } from "@plumix/blocks";

import { buildEditorRegistry, buildEditorShortcodes } from "./runtime.js";

describe("buildEditorRegistry", () => {
  test("includes core blocks even with no plugin specs", () => {
    const registry = buildEditorRegistry();
    expect(registry.has("core/rich-text")).toBe(true);
  });

  test("adds plugin block specs alongside core", () => {
    const widget = defineBlock({ name: "acme/widget", render: () => null });
    const registry = buildEditorRegistry([widget]);
    expect(registry.has("core/rich-text")).toBe(true);
    expect(registry.has("acme/widget")).toBe(true);
  });

  test("a plugin spec overrides a core block of the same name (last write wins)", () => {
    const override = defineBlock({
      name: "core/rich-text",
      render: () => null,
    });
    const registry = buildEditorRegistry([override]);
    expect(registry.get("core/rich-text")).toBe(override);
  });
});

describe("buildEditorShortcodes", () => {
  const context = { siteSettings: {}, locale: "en", entry: null };
  const render = (
    registry: ReturnType<typeof buildEditorShortcodes>,
    name: string,
  ): string | undefined => registry.get(name)?.render({ atts: {}, context });

  test("includes the core shortcodes with none contributed", () => {
    expect(render(buildEditorShortcodes(), "year")).toBe(
      String(new Date().getFullYear()),
    );
  });

  // The generated entry hands plugin specs before theme specs, so last-wins
  // gives the server's `core < plugin < theme` precedence.
  test("a later (theme) spec wins over an earlier (plugin) one of the same tag", () => {
    const plugin = defineShortcode({ name: "brand", render: () => "Plugin" });
    const theme = defineShortcode({ name: "brand", render: () => "Theme" });
    expect(render(buildEditorShortcodes([plugin]), "brand")).toBe("Plugin");
    expect(render(buildEditorShortcodes([plugin, theme]), "brand")).toBe(
      "Theme",
    );
  });
});
