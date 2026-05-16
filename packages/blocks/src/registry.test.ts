import { Node as TiptapNode } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import type { BlockComponent, BlockSpec } from "./types.js";
import { defineBlock } from "./define-block.js";
import { mergeBlockRegistry } from "./registry.js";

function paragraph(opts: {
  name: string;
  component?: BlockComponent;
}): BlockSpec {
  const DefaultComponent: BlockComponent = ({ children }) => children as never;
  return defineBlock({
    name: opts.name,
    title: opts.name,
    schema: () =>
      Promise.resolve(
        TiptapNode.create({
          name: opts.name,
          group: "block",
          content: "inline*",
        }),
      ),
    component: () => Promise.resolve(opts.component ?? DefaultComponent),
  });
}

describe("mergeBlockRegistry", () => {
  test("seeds with core specs and exposes get/has/size/iterator", async () => {
    const reg = await mergeBlockRegistry({
      core: [paragraph({ name: "core/paragraph" })],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    expect(reg.size).toBe(1);
    expect(reg.has("core/paragraph")).toBe(true);
    expect(reg.get("core/paragraph")?.name).toBe("core/paragraph");
    expect([...reg].map(([name]) => name)).toEqual(["core/paragraph"]);
  });

  test("plugin layer adds blocks to the merged registry", async () => {
    const reg = await mergeBlockRegistry({
      core: [paragraph({ name: "core/paragraph" })],
      plugins: [
        { spec: paragraph({ name: "media/image" }), pluginId: "media" },
      ],
      themeOverrides: {},
      themeId: null,
    });
    expect(reg.size).toBe(2);
    expect(reg.get("media/image")?.registeredBy).toBe("media");
    expect(reg.get("core/paragraph")?.registeredBy).toBe(null);
  });

  test("duplicate within the core layer throws", async () => {
    await expect(
      mergeBlockRegistry({
        core: [
          paragraph({ name: "core/paragraph" }),
          paragraph({ name: "core/paragraph" }),
        ],
        plugins: [],
        themeOverrides: {},
        themeId: null,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "duplicate_name",
        layer: "core",
        blockName: "core/paragraph",
      }),
    );
  });

  test("duplicate within the plugin layer throws", async () => {
    await expect(
      mergeBlockRegistry({
        core: [],
        plugins: [
          { spec: paragraph({ name: "media/image" }), pluginId: "media" },
          { spec: paragraph({ name: "media/image" }), pluginId: "media-extra" },
        ],
        themeOverrides: {},
        themeId: null,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "duplicate_name",
        layer: "plugin",
        blockName: "media/image",
      }),
    );
  });

  test("plugin using the core/ namespace throws", async () => {
    await expect(
      mergeBlockRegistry({
        core: [],
        plugins: [
          {
            spec: paragraph({ name: "core/sneaky" }),
            pluginId: "naughty",
          },
        ],
        themeOverrides: {},
        themeId: null,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "core_block_collision",
        blockName: "core/sneaky",
        registeredBy: "naughty",
      }),
    );
  });

  test("theme override of an unknown name throws", async () => {
    const overrideComponent: BlockComponent = ({ children }) =>
      children as never;
    await expect(
      mergeBlockRegistry({
        core: [paragraph({ name: "core/paragraph" })],
        plugins: [],
        themeOverrides: { "made-up/block": overrideComponent },
        themeId: "acme",
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "theme_override_unknown_name",
        blockName: "made-up/block",
        themeId: "acme",
      }),
    );
  });

  test("theme override replaces the component for an existing block", async () => {
    const Override: BlockComponent = ({ children }) => children as never;
    const reg = await mergeBlockRegistry({
      core: [paragraph({ name: "core/paragraph" })],
      plugins: [],
      themeOverrides: { "core/paragraph": Override },
      themeId: "acme",
    });
    expect(reg.get("core/paragraph")?.component).toBe(Override);
  });

  test("theme override does not touch non-overridden blocks", async () => {
    const Override: BlockComponent = ({ children }) => children as never;
    const reg = await mergeBlockRegistry({
      core: [
        paragraph({ name: "core/paragraph" }),
        paragraph({ name: "core/heading" }),
      ],
      plugins: [],
      themeOverrides: { "core/paragraph": Override },
      themeId: "acme",
    });
    expect(reg.get("core/heading")?.component).not.toBe(Override);
    expect(reg.get("core/heading")?.registeredBy).toBe(null);
  });

  test("ESM-default-export shape is unwrapped during resolution", async () => {
    const Component: BlockComponent = ({ children }) => children as never;
    const spec = defineBlock({
      name: "core/paragraph",
      title: "Paragraph",
      schema: () =>
        Promise.resolve(
          TiptapNode.create({
            name: "core/paragraph",
            group: "block",
            content: "inline*",
          }),
        ),
      component: () => Promise.resolve({ default: Component }),
    });
    const reg = await mergeBlockRegistry({
      core: [spec],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    expect(reg.get("core/paragraph")?.component).toBe(Component);
  });
});
