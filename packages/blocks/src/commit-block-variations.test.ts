import { describe, expect, test } from "vitest";

import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { commitBlockVariations } from "./commit-block-variations.js";
import { headingBlock } from "./heading/index.js";

describe("commitBlockVariations", () => {
  test("accepts a registry whose variations carry no innerBlocks", () => {
    const blocks = createBlockRegistry([headingBlock]);
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
    const blocks = createBlockRegistry([group, headingBlock]);
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
              name: "core/heading",
              attrs: { level: 2, ghost: true },
            },
          ],
        },
      ],
    });
    const blocks = createBlockRegistry([group, headingBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "bad-attr" of "core\/group-test" at innerBlocks\[0\] uses undeclared attr "ghost" on block "core\/heading"/,
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
          innerBlocks: [{ id: "h", name: "core/heading", attrs: {} }],
        },
      ],
    });
    const blocks = createBlockRegistry([heading, headingBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /Variation "with-children" of "x-test\/leaf" declares innerBlocks but the parent block has no "content" slot input/,
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
    const blocks = createBlockRegistry([group, headingBlock]);
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
    const blocks = createBlockRegistry([group, headingBlock]);
    expect(() => commitBlockVariations(blocks)).toThrow(
      /innerBlocks\[0\]\.content\[0\] references unknown block "core\/ghost"/,
    );
  });
});
