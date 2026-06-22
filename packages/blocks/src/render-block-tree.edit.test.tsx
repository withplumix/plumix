import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { groupBlock } from "./group/index.js";
import { headingBlock } from "./heading/index.js";
import { renderBlockTree } from "./render-block-tree.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
} from "./table/index.js";

const registry = createBlockRegistry([headingBlock, groupBlock]);
const tableRegistry = createBlockRegistry([
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
]);
const tree: readonly BlockNode[] = [
  { id: "abc", name: "core/heading", attrs: { text: "Hi", level: 2 } },
];

const nested: readonly BlockNode[] = [
  {
    id: "g1",
    name: "core/group",
    attrs: {
      content: [{ id: "h1", name: "core/heading", attrs: { text: "x" } }],
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

    // The heading spreads the seam onto its <h2>, so there's no wrapper <div>
    // — which is what lets table cells (a <td> can't be wrapped) stay selectable.
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

  test("editing gives an empty slot a droppable placeholder", () => {
    const empty: readonly BlockNode[] = [
      { id: "g2", name: "core/group", attrs: { content: [] } },
    ];
    const html = renderToStaticMarkup(
      renderBlockTree(empty, registry, { editing: true }),
    );

    expect(html).toContain('data-plumix-slot-parent="g2"');
    expect(html).toContain("data-plumix-slot-empty");
  });

  test("the normal render carries no slot markers", () => {
    const html = renderToStaticMarkup(renderBlockTree(nested, registry));

    expect(html).not.toContain("data-plumix-slot");
  });
});
