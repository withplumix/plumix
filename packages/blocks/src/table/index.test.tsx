import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./index.js";

describe("core/table family", () => {
  test("renders a <table> with a <tbody> and theme-overridable cell CSS", () => {
    const html = renderBlockSpecToHtml(tableBlock, {});

    expect(html).toContain("<table>");
    expect(html).toContain("<tbody>");
    // One rule covers both <th> and <td>, so header and body share padding.
    expect(html).toContain("th,td{");
    expect(html).toContain("--plumix-table-cell-padding");
  });

  test("exposes only the rows slot — no custom styling inputs", () => {
    const names = tableBlock.inputs?.map((i) => i.name) ?? [];
    expect(names).toEqual(["rows"]);
  });

  test("cell align input has capitalized labels and a Left placeholder", () => {
    for (const spec of [tableHeaderCellBlock, tableCellBlock]) {
      const align = spec.inputs?.find((i) => i.name === "align");
      expect(align?.placeholder).toBe("Left");
      expect(align?.options?.map((o) => o.label)).toEqual([
        "Left",
        "Center",
        "Right",
      ]);
      // Only the label is capitalized — the stored value stays lowercase (what
      // pickAlign matches and the render emits as data-align).
      expect(align?.options?.map((o) => o.value)).toEqual([
        "left",
        "center",
        "right",
      ]);
    }
  });

  test("renders <th scope=col> for header-cell, seam on the <th> (selfSeam)", () => {
    const html = renderBlockSpecToHtml(tableHeaderCellBlock, {
      text: "Name",
      align: "center",
    });

    expect(html).toBe('<th scope="col" data-align="center">Name</th>');
  });

  test("renders <td> for body cells, seam on the <td> (selfSeam)", () => {
    const html = renderBlockSpecToHtml(tableCellBlock, { text: "v1" });

    expect(html).toBe("<td>v1</td>");
  });

  test("seeds a starter grid so a dropped table isn't an empty strip", () => {
    const slot = tableBlock.inputs?.find((i) => i.name === "rows");
    expect(slot?.allowedBlocks).toEqual([
      "core/table-header-row",
      "core/table-body-row",
    ]);
    const seeded = slot?.defaultChildren ?? [];
    expect(seeded.map((n) => n.name)).toEqual([
      "core/table-header-row",
      "core/table-body-row",
      "core/table-body-row",
    ]);
    // Every row seeds the same cell count, so the starter grid is rectangular.
    const cellCounts = seeded.map(
      (row) => (row.attrs?.cells as readonly unknown[] | undefined)?.length,
    );
    expect(cellCounts).toEqual([3, 3, 3]);
    // Cells carry placeholder text so the dropped table isn't visually empty.
    const headerCells = seeded[0]?.attrs?.cells as readonly BlockNode[];
    expect(headerCells.map((c) => c.attrs?.text)).toEqual([
      "Header 1",
      "Header 2",
      "Header 3",
    ]);
  });

  test("th/td nest as direct children of <tr>, rows inside a <tbody> (valid HTML content model)", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "t1",
        name: "core/table",
        attrs: {
          rows: [
            {
              id: "hr",
              name: "core/table-header-row",
              attrs: {
                cells: [
                  {
                    id: "th1",
                    name: "core/table-header-cell",
                    attrs: { text: "Col 1" },
                  },
                ],
              },
            },
            {
              id: "br",
              name: "core/table-body-row",
              attrs: {
                cells: [
                  {
                    id: "td1",
                    name: "core/table-cell",
                    attrs: { text: "val 1" },
                  },
                ],
              },
            },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [
        tableBlock,
        tableHeaderRowBlock,
        tableBodyRowBlock,
        tableHeaderCellBlock,
        tableCellBlock,
      ],
      tree,
    );

    // The rows/cells nest directly (selfSeam → no wrapper divs between them);
    // only the per-block seam attribute rides on each element. Rows sit in a
    // <tbody> so `<tr>` is never a direct child of `<table>` (invalid HTML).
    expect(html).toContain(
      '<table><tbody><tr data-header="">' +
        '<th scope="col">Col 1</th></tr>' +
        "<tr>" +
        "<td>val 1</td></tr></tbody></table>",
    );
  });
});
