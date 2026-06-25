import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { columnsBlock } from "./columns/index.js";
import { groupBlock } from "./group/index.js";
import { renderBlockTree } from "./render-block-tree.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
} from "./table/index.js";

// A minimal selfSeam leaf standing in for the former core/heading: it spreads
// the seam onto its own <h2> with no wrapper div — the property this suite pins
// (the same reason a <td> table cell stays selectable).
const selfSeamBlock = defineBlock({
  name: "test/self-seam",
  selfSeam: true,
  inputs: [{ name: "text", type: "text" }],
  render: ({ attrs, blockProps }) =>
    createElement("h2", blockProps, (attrs as { text?: string }).text ?? ""),
});

const registry = createBlockRegistry([selfSeamBlock, groupBlock, columnsBlock]);
const tableRegistry = createBlockRegistry([
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
]);
const tree: readonly BlockNode[] = [
  { id: "abc", name: "test/self-seam", attrs: { text: "Hi" } },
];

const nested: readonly BlockNode[] = [
  {
    id: "g1",
    name: "core/group",
    attrs: {
      content: [{ id: "h1", name: "test/self-seam", attrs: { text: "x" } }],
    },
  },
];

describe("renderBlockTree edit-aware seam", () => {
  test("editing tags each block wrapper with its id for canvas selection", () => {
    const html = renderToStaticMarkup(
      renderBlockTree(tree, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-id="abc"');
  });

  test("a selfSeam block carries its id on its own element, not a wrapper div", () => {
    const html = renderToStaticMarkup(
      renderBlockTree(tree, registry, { editing: true }),
    );

    // The selfSeam block spreads the seam onto its <h2>, so there's no wrapper
    // <div> — what lets table cells (a <td> can't be wrapped) stay selectable.
    expect(html).toMatch(/<h2[^>]*\bdata-plumix-id="abc"/);
    expect(html).not.toContain('<div data-plumix-id="abc"');
  });

  test("table cells are selectable — the seam rides on the <td>", () => {
    const table: readonly BlockNode[] = [
      {
        id: "t1",
        name: "core/table",
        attrs: {
          rows: [
            {
              id: "r1",
              name: "core/table-body-row",
              attrs: {
                cells: [{ id: "c1", name: "core/table-cell", attrs: {} }],
              },
            },
          ],
        },
      },
    ];
    const html = renderToStaticMarkup(
      renderBlockTree(table, tableRegistry, { editing: true }),
    );

    expect(html).toMatch(/<td[^>]*\bdata-plumix-id="c1"/);
  });

  test("the normal (non-editing) render carries no editor annotations", () => {
    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).not.toContain("data-plumix-id");
  });

  test("editing marks each container slot so the canvas can target nested drops", () => {
    const html = renderToStaticMarkup(
      renderBlockTree(nested, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-slot-parent="g1"');
    expect(html).toContain('data-plumix-slot-key="content"');
    // The marker is layout-neutral (display:contents) — the child still renders.
    expect(html).toContain('data-plumix-id="h1"');
  });

  test("editing gives an empty slot a droppable placeholder + add affordance", () => {
    const empty: readonly BlockNode[] = [
      { id: "g2", name: "core/group", attrs: { content: [] } },
    ];
    const html = renderToStaticMarkup(
      renderBlockTree(empty, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-slot-parent="g2"');
    expect(html).toContain("data-plumix-slot-empty");
    // The empty slot shows the in-canvas "Add a block" affordance scoped to it.
    expect(html).toContain("data-plumix-add");
    expect(html).toContain('data-plumix-add-parent="g2"');
    expect(html).toContain('data-plumix-add-slot="content"');
  });

  test("editing reveals declared slots even when the attr was never set", () => {
    // Columns ship with no `left`/`right` in their defaults, so a freshly
    // inserted columns block has unset slots. Edit mode must still surface each
    // declared slot as an empty drop target with its own "Add a block".
    const cols: readonly BlockNode[] = [{ id: "c1", name: "core/columns" }];
    const html = renderToStaticMarkup(
      renderBlockTree(cols, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-slot-key="left"');
    expect(html).toContain('data-plumix-slot-key="right"');
    expect(html).toContain('data-plumix-add-slot="left"');
    expect(html).toContain('data-plumix-add-slot="right"');
  });

  test("an unset slot stays absent outside edit mode (no SSR drift)", () => {
    const cols: readonly BlockNode[] = [{ id: "c1", name: "core/columns" }];
    const html = renderToStaticMarkup(renderBlockTree(cols, registry));

    expect(html).not.toContain("data-plumix-slot");
    expect(html).not.toContain("data-plumix-add");
  });

  test("threads the localized add-block label into the empty-slot affordance", () => {
    const empty: readonly BlockNode[] = [
      { id: "g2", name: "core/group", attrs: { content: [] } },
    ];
    const html = renderToStaticMarkup(
      renderBlockTree(empty, registry, {
        editing: true,
        addBlockLabel: "Ajouter un bloc",
      }),
    );

    expect(html).toContain("Ajouter un bloc");
    expect(html).not.toContain("Add a block");
  });

  test("the normal render carries no slot markers or add affordance", () => {
    const html = renderToStaticMarkup(renderBlockTree(nested, registry));

    expect(html).not.toContain("data-plumix-slot");
    expect(html).not.toContain("data-plumix-add");
  });
});
