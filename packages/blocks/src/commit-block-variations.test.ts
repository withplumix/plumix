import { describe, expect, test } from "vitest";

import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { commitBlockVariations } from "./commit-block-variations.js";
import { richTextBlock } from "./rich-text/index.js";

describe("commitBlockVariations", () => {
  test("accepts a registry whose variations carry no innerBlocks", () => {
    const blocks = createBlockRegistry([richTextBlock]);
    expect(() => commitBlockVariations(blocks)).not.toThrow();
  });

  test("rejects an innerBlocks node referencing an unknown block", () => {
    const group = defineBlock({
      name: "core/group-test",
      title: "Group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
      variations: [
        {
          slug: "with-ghost",
          title: "With ghost",
          innerBlocks: [{ id: "g1", name: "core/ghost", attrs: {} }],
        },
      ],
    });
    const blocks = createBlockRegistry([group, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "with-ghost" of "core\/group-test" at innerBlocks\[0\] references unknown block "core\/ghost"/,
    );
  });

  test("rejects an innerBlocks node with an undeclared attr", () => {
    const group = defineBlock({
      name: "core/group-test",
      title: "Group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
      variations: [
        {
          slug: "bad-attr",
          title: "Bad attr",
          innerBlocks: [
            {
              id: "h1",
              name: "core/rich-text",
              attrs: { body: "<p></p>", ghost: true },
            },
          ],
        },
      ],
    });
    const blocks = createBlockRegistry([group, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "bad-attr" of "core\/group-test" at innerBlocks\[0\] uses undeclared attr "ghost" on block "core\/rich-text"/,
    );
  });

  test("rejects innerBlocks declared on a block that has no content slot", () => {
    const heading = defineBlock({
      name: "x-test/leaf",
      title: "Leaf",
      inputs: [{ name: "text", type: "text" }],
      render: () => null,
      variations: [
        {
          slug: "with-children",
          title: "With children",
          innerBlocks: [{ id: "h", name: "core/rich-text", attrs: {} }],
        },
      ],
    });
    const blocks = createBlockRegistry([heading, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "with-children" of "x-test\/leaf" declares innerBlocks at innerBlocks but the parent block has no "content" slot input/,
    );
  });

  test("rejects variation.attrs whose keys aren't declared inputs on the parent block", () => {
    const group = defineBlock({
      name: "x-test/group",
      title: "Group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
      variations: [
        {
          slug: "rogue-attr",
          title: "Rogue attr",
          attrs: { layout: "stack" },
        },
      ],
    });
    const blocks = createBlockRegistry([group, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "rogue-attr" of "x-test\/group" at variation\.attrs uses undeclared attr "layout" on block "x-test\/group"/,
    );
  });

  test("rejects scope values outside the declared union", () => {
    const block = defineBlock({
      name: "x-test/scoped",
      title: "Scoped",
      render: () => null,
      variations: [
        {
          slug: "rogue-scope",
          title: "Rogue scope",
          scope: ["banner" as "inserter"],
        },
      ],
    });
    const blocks = createBlockRegistry([block]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "rogue-scope" of "x-test\/scoped" declares scope value "banner" outside the allowed union/,
    );
  });

  test("rejects example.attrs whose keys aren't declared inputs on the parent block", () => {
    const group = defineBlock({
      name: "x-test/group",
      title: "Group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
      variations: [
        {
          slug: "rogue-example-attr",
          title: "Rogue example attr",
          example: { attrs: { ghost: "x" } },
        },
      ],
    });
    const blocks = createBlockRegistry([group, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "rogue-example-attr" of "x-test\/group" at example\.attrs uses undeclared attr "ghost" on block "x-test\/group"/,
    );
  });

  test("rejects example.innerBlocks declared on a block that has no content slot", () => {
    const leaf = defineBlock({
      name: "x-test/leaf",
      title: "Leaf",
      inputs: [{ name: "text", type: "text" }],
      render: () => null,
      variations: [
        {
          slug: "with-example-children",
          title: "With example children",
          example: {
            innerBlocks: [{ id: "h", name: "core/rich-text", attrs: {} }],
          },
        },
      ],
    });
    const blocks = createBlockRegistry([leaf, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "with-example-children" of "x-test\/leaf" declares innerBlocks at example\.innerBlocks but the parent block has no "content" slot input/,
    );
  });

  test("rejects a transform-scope variation with no attrs to apply", () => {
    const block = defineBlock({
      name: "x-test/empty-transform",
      title: "Empty Transform",
      inputs: [{ name: "layout", type: "text" }],
      render: () => null,
      variations: [
        {
          slug: "no-attrs",
          title: "No attrs",
          scope: ["transform"],
        },
      ],
    });
    const blocks = createBlockRegistry([block]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "no-attrs" of "x-test\/empty-transform" is scoped "transform" but declares no attrs to apply/,
    );
  });

  test("rejects a transform-scope variation whose attrs object is empty — same no-op shape", () => {
    const block = defineBlock({
      name: "x-test/empty-transform",
      title: "Empty Transform",
      inputs: [{ name: "layout", type: "text" }],
      render: () => null,
      variations: [
        {
          slug: "empty-attrs",
          title: "Empty attrs",
          attrs: {},
          scope: ["transform"],
        },
      ],
    });
    const blocks = createBlockRegistry([block]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "empty-attrs" of "x-test\/empty-transform" is scoped "transform" but declares no attrs to apply/,
    );
  });

  test("validates example.innerBlocks against the block registry", () => {
    const group = defineBlock({
      name: "x-test/group",
      title: "Group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
      variations: [
        {
          slug: "with-example",
          title: "With example",
          example: {
            innerBlocks: [{ id: "g1", name: "core/ghost", attrs: {} }],
          },
        },
      ],
    });
    const blocks = createBlockRegistry([group, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "with-example" of "x-test\/group" at example\.innerBlocks\[0\] references unknown block "core\/ghost"/,
    );
  });

  test("recurses into slot-shaped attrs to validate nested innerBlocks", () => {
    const group = defineBlock({
      name: "core/group-test",
      title: "Group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
      variations: [
        {
          slug: "nested-ghost",
          title: "Nested ghost",
          innerBlocks: [
            {
              id: "g1",
              name: "core/group-test",
              attrs: {
                content: [{ id: "x", name: "core/ghost", attrs: {} }],
              },
            },
          ],
        },
      ],
    });
    const blocks = createBlockRegistry([group, richTextBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /innerBlocks\[0\]\.content\[0\] references unknown block "core\/ghost"/,
    );
  });
});
