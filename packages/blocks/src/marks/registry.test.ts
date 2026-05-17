import { Mark as TiptapMark } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import type { MarkComponent, MarkSpec } from "./types.js";
import { defineMark } from "./define-mark.js";
import { mergeMarkRegistry } from "./registry.js";

function makeMark(name: string, component?: MarkComponent): MarkSpec {
  const DefaultComponent: MarkComponent = ({ children }) => children as never;
  return defineMark({
    name,
    title: name,
    schema: () => Promise.resolve(TiptapMark.create({ name })),
    component: () => Promise.resolve(component ?? DefaultComponent),
  });
}

describe("mergeMarkRegistry", () => {
  test("seeds with core specs and exposes get/has/size/iterator", async () => {
    const reg = await mergeMarkRegistry({
      core: [makeMark("bold")],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    expect(reg.size).toBe(1);
    expect(reg.has("bold")).toBe(true);
    expect(reg.get("bold")?.name).toBe("bold");
    expect([...reg].map(([n]) => n)).toEqual(["bold"]);
  });

  test("plugin contributions register under the plugin id", async () => {
    const reg = await mergeMarkRegistry({
      core: [makeMark("bold")],
      plugins: [{ spec: makeMark("affiliate/link"), pluginId: "affiliate" }],
      themeOverrides: {},
      themeId: null,
    });
    expect(reg.size).toBe(2);
    expect(reg.get("affiliate/link")?.registeredBy).toBe("affiliate");
    expect(reg.get("bold")?.registeredBy).toBe(null);
  });

  test("duplicate within the core layer throws", async () => {
    await expect(
      mergeMarkRegistry({
        core: [makeMark("bold"), makeMark("bold")],
        plugins: [],
        themeOverrides: {},
        themeId: null,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "duplicate_name",
        layer: "core",
        markName: "bold",
      }),
    );
  });

  test("plugin colliding with a core mark name throws", async () => {
    await expect(
      mergeMarkRegistry({
        core: [makeMark("bold")],
        plugins: [{ spec: makeMark("bold"), pluginId: "naughty" }],
        themeOverrides: {},
        themeId: null,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "core_mark_collision",
        markName: "bold",
        registeredBy: "naughty",
      }),
    );
  });

  test("theme override of an unknown mark throws", async () => {
    const Override: MarkComponent = ({ children }) => children as never;
    await expect(
      mergeMarkRegistry({
        core: [makeMark("bold")],
        plugins: [],
        themeOverrides: { "made-up": Override },
        themeId: "acme",
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "theme_override_unknown_name",
        markName: "made-up",
        themeId: "acme",
      }),
    );
  });

  test("theme override replaces the component for an existing mark", async () => {
    const Override: MarkComponent = ({ children }) => children as never;
    const reg = await mergeMarkRegistry({
      core: [makeMark("bold")],
      plugins: [],
      themeOverrides: { bold: Override },
      themeId: "acme",
    });
    expect(reg.get("bold")?.component).toBe(Override);
  });

  test("schema name mismatch throws at merge time", async () => {
    const spec = defineMark({
      name: "bold",
      title: "Bold",
      schema: () => Promise.resolve(TiptapMark.create({ name: "wrong-name" })),
      component: () =>
        Promise.resolve((({ children }) => children) as MarkComponent),
    });
    await expect(
      mergeMarkRegistry({
        core: [spec],
        plugins: [],
        themeOverrides: {},
        themeId: null,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "schema_name_mismatch",
        markName: "bold",
        schemaName: "wrong-name",
      }),
    );
  });

  test("ESM-default-export shape is unwrapped during resolution", async () => {
    const Component: MarkComponent = ({ children }) => children as never;
    const spec = defineMark({
      name: "bold",
      title: "Bold",
      schema: () => Promise.resolve(TiptapMark.create({ name: "bold" })),
      component: () => Promise.resolve({ default: Component }),
    });
    const reg = await mergeMarkRegistry({
      core: [spec],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    expect(reg.get("bold")?.component).toBe(Component);
  });
});
