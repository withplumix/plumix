import type { BlockSpec } from "./block-registry.js";
import { describe, expect, test } from "vitest";

import { createBlockRegistry, defineBlock } from "./block-registry.js";

function makeSpec(name: string, render: BlockSpec["render"]): BlockSpec {
  return { name, render };
}

const noopRender: BlockSpec["render"] = () => null;

describe("createBlockRegistry", () => {
  test("looks up a registered spec by name", () => {
    const heading = makeSpec("core/heading", noopRender);
    const registry = createBlockRegistry([heading]);

    expect(registry.get("core/heading")).toBe(heading);
    expect(registry.has("core/heading")).toBe(true);
    expect(registry.has("acme/missing")).toBe(false);
  });

  test("re-registration with the same name replaces the spec wholesale", () => {
    const v1 = makeSpec("core/heading", noopRender);
    const v2 = makeSpec("core/heading", noopRender);
    const registry = createBlockRegistry([v1, v2]);

    expect(registry.get("core/heading")).toBe(v2);
    expect(registry.size).toBe(1);
  });

  test("iteration yields specs in insertion order", () => {
    const heading = makeSpec("core/heading", noopRender);
    const paragraph = makeSpec("core/paragraph", noopRender);
    const image = makeSpec("media/image", noopRender);
    const registry = createBlockRegistry([heading, paragraph, image]);

    expect([...registry].map((s) => s.name)).toEqual([
      "core/heading",
      "core/paragraph",
      "media/image",
    ]);
  });

  test("iteration on a replaced spec yields the latest at its first insertion position", () => {
    const v1 = makeSpec("core/heading", noopRender);
    const paragraph = makeSpec("core/paragraph", noopRender);
    const v2 = makeSpec("core/heading", noopRender);
    const registry = createBlockRegistry([v1, paragraph, v2]);

    const order = [...registry];
    expect(order.map((s) => s.name)).toEqual([
      "core/heading",
      "core/paragraph",
    ]);
    expect(order[0]).toBe(v2);
  });
});

describe("defineBlock", () => {
  test("returns the spec with the outer object shallow-frozen", () => {
    const spec = defineBlock({
      name: "core/heading",
      title: "Heading",
      render: noopRender,
    });

    expect(spec.name).toBe("core/heading");
    expect(spec.title).toBe("Heading");
    expect(Object.isFrozen(spec)).toBe(true);
  });

  test("preserves the defaults object on the returned spec", () => {
    const spec = defineBlock({
      name: "core/heading",
      defaults: { level: 2, text: "Untitled" },
      render: noopRender,
    });

    expect(spec.defaults).toEqual({ level: 2, text: "Untitled" });
  });
});
