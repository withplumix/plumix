import { Node as TiptapNode } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import type { BlockProps, TiptapNode as TiptapNodeJson } from "./types.js";
import { defineBlock } from "./define-block.js";
import { collectActiveIslands } from "./islands.js";
import { mergeBlockRegistry } from "./registry.js";

function islandSpec(name: string, src: string) {
  return defineBlock({
    name,
    title: name,
    schema: () => Promise.resolve(TiptapNode.create({ name, group: "block" })),
    component: () => Promise.resolve(({ children }: BlockProps) => children),
    client: { src },
  });
}

function plainSpec(name: string) {
  return defineBlock({
    name,
    title: name,
    schema: () => Promise.resolve(TiptapNode.create({ name, group: "block" })),
    component: () => Promise.resolve(({ children }: BlockProps) => children),
  });
}

function deeplyNested(
  containerType: string,
  innerType: string,
  depth: number,
): TiptapNodeJson {
  let current: TiptapNodeJson = { type: innerType };
  for (let i = 0; i < depth; i += 1) {
    current = { type: containerType, content: [current] };
  }
  return { type: "doc", content: [current] };
}

describe("collectActiveIslands", () => {
  test("dedupes active islands across multiple instances of the same block", async () => {
    const registry = await mergeBlockRegistry({
      core: [
        islandSpec("core/widget", "/assets/widget.js"),
        plainSpec("core/plain"),
      ],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        { type: "core/widget" },
        { type: "core/plain" },
        { type: "core/widget" },
      ],
    };
    const islands = collectActiveIslands(doc, registry);
    expect(islands).toEqual([
      { name: "core/widget", src: "/assets/widget.js" },
    ]);
  });

  test("does not overflow the stack on deeply nested content", async () => {
    const containerSpec = defineBlock({
      name: "core/container",
      title: "Container",
      schema: () =>
        Promise.resolve(
          TiptapNode.create({
            name: "core/container",
            group: "block",
            content: "block+",
          }),
        ),
      component: () => Promise.resolve(({ children }: BlockProps) => children),
    });
    const registry = await mergeBlockRegistry({
      core: [containerSpec, islandSpec("core/widget", "/assets/widget.js")],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    // 10k of nesting would blow a recursive walker on most V8 builds.
    const doc = deeplyNested("core/container", "core/widget", 10_000);
    const islands = collectActiveIslands(doc, registry);
    expect(islands).toEqual([
      { name: "core/widget", src: "/assets/widget.js" },
    ]);
  });
});
