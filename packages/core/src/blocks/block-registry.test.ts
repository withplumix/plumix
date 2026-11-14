import { describe, expect, test } from "vitest";

import type { BlockField, BlockSpec } from "./block-registry.js";
import type { BlockView } from "./render-block-tree.js";
import {
  contentInput,
  createBlockRegistry,
  defineBlock,
} from "./block-registry.js";

function makeSpec(name: string, render: BlockView): BlockSpec {
  return {
    name,
    view: () =>
      Promise.resolve({
        default: render,
      }),
  };
}

const noopRender: BlockView = () => null;

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

const title: BlockField = {
  key: "title",
  label: "Title",
  type: "string",
  inputType: "text",
};

describe("defineBlock", () => {
  test("turns a meta-box field into an input carrying it", () => {
    const spec = defineBlock({
      name: "acme/card",
      inputs: [title],
      view: () => Promise.resolve({ default: noopRender }),
    });

    expect(spec.inputs).toEqual([
      { name: "title", type: "text", label: "Title", field: title },
    ]);
  });

  test("builds a field builder into an input carrying its field", () => {
    const spec = defineBlock({
      name: "acme/card",
      inputs: [{ build: () => title }],
      view: () => Promise.resolve({ default: noopRender }),
    });

    expect(spec.inputs?.[0]?.field).toBe(title);
  });

  test("keeps a block input as declared", () => {
    const slot = { name: "content", type: "slot" };

    const spec = defineBlock({
      name: "acme/card",
      inputs: [slot],
      view: () => Promise.resolve({ default: noopRender }),
    });

    expect(spec.inputs?.[0]).toBe(slot);
  });

  test("returns the spec with the outer object shallow-frozen", () => {
    const spec = defineBlock({
      name: "core/heading",
      title: "Heading",
      view: () =>
        Promise.resolve({
          default: noopRender,
        }),
    });

    expect(spec.name).toBe("core/heading");
    expect(spec.title).toBe("Heading");
    expect(Object.isFrozen(spec)).toBe(true);
  });

  test("preserves the defaults object on the returned spec", () => {
    const spec = defineBlock({
      name: "core/heading",
      defaults: { level: 2, text: "Untitled" },
      view: () =>
        Promise.resolve({
          default: noopRender,
        }),
    });

    expect(spec.defaults).toEqual({ level: 2, text: "Untitled" });
  });

  test("text slots accept MessageDescriptor for translation", () => {
    const spec = defineBlock({
      name: "acme/hero",
      title: { id: "block.hero.title", message: "Hero" },
      description: { id: "block.hero.description", message: "A hero block." },
      keywords: [
        "banner",
        { id: "block.hero.kw.cta", message: "call to action" },
      ],
      view: () =>
        Promise.resolve({
          default: noopRender,
        }),
      variations: [
        {
          slug: "split",
          title: { id: "block.hero.split.title", message: "Split Hero" },
          description: {
            id: "block.hero.split.description",
            message: "Two columns.",
          },
          keywords: ["split"],
        },
      ],
    });

    expect(spec.title).toEqual({ id: "block.hero.title", message: "Hero" });
    expect(spec.variations?.[0]?.title).toEqual({
      id: "block.hero.split.title",
      message: "Split Hero",
    });
  });
});

describe("contentInput", () => {
  test("marks a meta-box field input as a content input", () => {
    expect(contentInput({ build: () => title })).toEqual({
      name: "title",
      type: "text",
      label: "Title",
      field: title,
      content: true,
    });
  });
});
