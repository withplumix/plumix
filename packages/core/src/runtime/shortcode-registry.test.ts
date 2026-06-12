import { describe, expect, test } from "vitest";

import type { ShortcodeSpec } from "@plumix/blocks";

import { assembleShortcodeRegistry } from "./shortcode-registry.js";

function spec(name: string, output: string): ShortcodeSpec {
  return { name, render: () => output };
}

function render(
  registry: ReturnType<typeof assembleShortcodeRegistry>,
  tag: string,
) {
  return registry.get(tag)?.render({
    atts: {},
    context: { siteSettings: {}, locale: "en", entry: null },
  });
}

describe("assembleShortcodeRegistry", () => {
  test("includes core built-ins", () => {
    const registry = assembleShortcodeRegistry([spec("year", "2026")], [], []);
    expect(render(registry, "year")).toBe("2026");
  });

  test("a plugin shortcode overrides a core tag", () => {
    const registry = assembleShortcodeRegistry(
      [spec("year", "core")],
      [spec("year", "plugin")],
      [],
    );
    expect(render(registry, "year")).toBe("plugin");
  });

  test("a theme shortcode overrides both plugin and core (last wins)", () => {
    const registry = assembleShortcodeRegistry(
      [spec("year", "core")],
      [spec("year", "plugin")],
      [spec("year", "theme")],
    );
    expect(render(registry, "year")).toBe("theme");
  });
});
