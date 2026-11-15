import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";

import type { JsonObject, JsonValue } from "../json.js";
import type { BlockInput, BlockRegistry, BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { blockSlotKeys } from "./block-slots.js";
import { coreBlocks } from "./core-blocks.js";
import { defineEntryContent, isEntryContent } from "./entry-content.js";
import { isBlockNodeArray } from "./render-block-tree.js";
import { validateEntryContent } from "./validate-content.js";

const registry = createBlockRegistry(coreBlocks);

const text = fc.string({ unit: "grapheme" });
const object = <T>(value: fc.Arbitrary<T>) =>
  fc.dictionary(text, value, { maxKeys: 3, noNullPrototype: true });
const optional = <T>(model: { [K in keyof T]: fc.Arbitrary<T[K]> }) =>
  fc.record(model, { requiredKeys: [], noNullPrototype: true });

const styleBucket = object(text);
const nodeFields = optional({
  style: optional({
    large: styleBucket,
    medium: styleBucket,
    small: styleBucket,
  }),
  hidden: optional({
    large: fc.boolean(),
    medium: fc.boolean(),
    small: fc.boolean(),
  }),
  htmlAttrs: object(text),
  label: text,
  tagName: text,
  className: text,
});

/** The value an editor stores for an input that is not a slot. */
function inputValue(input: BlockInput): fc.Arbitrary<JsonValue> {
  if (input.options && input.options.length > 0) {
    return fc.constantFrom(...input.options.map((option) => option.value));
  }
  if (input.type === "boolean" || input.type === "checkbox") {
    return fc.boolean();
  }
  if (input.field?.type === "number") {
    return fc.double({ noNaN: true, noDefaultInfinity: true });
  }
  if (input.field?.type === "json") {
    return fc.jsonValue().map((value) => value as JsonValue);
  }
  return text;
}

/**
 * Trees `validateEntryContent` accepts against `blocks`: each slot holds the
 * blocks its `allowedBlocks` lists, and a block with `requiresParent` sits only
 * under a listed parent. Slots nest at most `depth` deep.
 */
function blockTrees(
  blocks: BlockRegistry,
  depth: number,
): fc.Arbitrary<readonly BlockNode[]> {
  const specs = [...blocks];
  const nodes = new Map<string, fc.Arbitrary<BlockNode>>();

  const children = (
    parent: BlockSpec | null,
    slot: BlockInput | null,
    left: number,
  ): fc.Arbitrary<readonly BlockNode[]> => {
    const fits = specs.filter(
      (spec) =>
        (!slot?.allowedBlocks || slot.allowedBlocks.includes(spec.name)) &&
        (!spec.requiresParent ||
          (parent !== null && spec.requiresParent.includes(parent.name))),
    );
    if (left === 0 || fits.length === 0) return fc.constant([]);
    return fc.array(fc.oneof(...fits.map((spec) => node(spec, left - 1))), {
      maxLength: 3,
    });
  };

  const node = (spec: BlockSpec, left: number): fc.Arbitrary<BlockNode> => {
    const key = `${spec.name}@${String(left)}`;
    const cached = nodes.get(key);
    if (cached) return cached;
    const attrs = Object.fromEntries(
      (spec.inputs ?? [])
        .filter((input) => input.styleProperty === undefined)
        .map((input) => [
          input.name,
          input.type === "slot"
            ? children(spec, input, left)
            : inputValue(input),
        ]),
    ) as Record<string, fc.Arbitrary<JsonValue>>;
    const built = fc
      .tuple(
        fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/),
        optional(attrs),
        nodeFields,
      )
      .map(([id, attrs, fields]): BlockNode => ({
        id,
        name: spec.name,
        // `requiredKeys: []` leaves an input out, never sets it undefined.
        attrs: attrs as JsonObject,
        ...fields,
      }));
    nodes.set(key, built);
    return built;
  };

  return children(null, null, depth).map((tree) => withUniqueIds(tree, blocks));
}

/** Suffixes each id with its document-order index, as no two nodes share one. */
function withUniqueIds(
  tree: readonly BlockNode[],
  blocks: BlockRegistry,
  counter = { next: 0 },
): readonly BlockNode[] {
  return tree.map((node) => {
    const id = `${node.id}-${String(counter.next++)}`;
    const attrs = { ...node.attrs };
    for (const key of blockSlotKeys(node, blocks.get(node.name))) {
      const slot = attrs[key];
      if (isBlockNodeArray(slot)) {
        attrs[key] = withUniqueIds(slot, blocks, counter);
      }
    }
    return { ...node, id, attrs };
  });
}

/** What the `entries.content` column does: drizzle's JSON text mode. */
const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const coreTrees = blockTrees(registry, 3);

describe("defineEntryContent", () => {
  test("produces an envelope that the isEntryContent guard accepts", () => {
    const content = defineEntryContent([
      { id: "h", name: "core/heading", attrs: { text: "Hi" } },
    ]);
    expect(isEntryContent(content)).toBe(true);
  });
});

describe("entry content in storage", () => {
  test.prop([coreTrees], { seed: 3714 })(
    "reads every valid tree back unchanged, through the isEntryContent guard",
    (tree) => {
      const content = defineEntryContent(tree);

      const read = stored(content);

      expect(isEntryContent(read)).toBe(true);
      expect(read).toStrictEqual(content);
    },
  );

  test.prop([coreTrees], { seed: 3714 })(
    "saves a tree read back from storage again, with no layout change",
    (tree) => {
      const content = defineEntryContent(tree);

      const result = validateEntryContent(
        stored(content) as typeof content,
        registry,
        [content],
        undefined,
        undefined,
        { layoutFrom: [content] },
      );

      expect(result).toStrictEqual({ ok: true });
    },
  );
});
