import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./index.js";

describe("core/table family", () => {
  test("renders an empty <table> with no striped/bordered attrs by default", () => {
    const html = renderBlockSpecToHtml(tableBlock, {});

    expect(html).toContain("<table>");
    expect(html).not.toContain("data-striped");
    expect(html).not.toContain("data-bordered");
  });

  test("renders striped + bordered when truthy", () => {
    const html = renderBlockSpecToHtml(tableBlock, {
      striped: true,
      bordered: true,
    });

    expect(html).toContain('data-striped="true"');
    expect(html).toContain('data-bordered="true"');
  });

  test("renders <th scope=col> for header-cell with align attr, no universal wrapper (inline)", () => {
    const html = renderBlockSpecToHtml(tableHeaderCellBlock, {
      text: "Name",
      align: "center",
    });

    expect(html).toBe('<th scope="col" data-align="center">Name</th>');
  });

  test("renders <td> for body cells, no universal wrapper (inline)", () => {
    const html = renderBlockSpecToHtml(tableCellBlock, { text: "v1" });

    expect(html).toBe("<td>v1</td>");
  });

  test("th/td nest as direct children of <tr>, <tr> as direct children of <table> (preserves HTML content model)", () => {
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

    expect(html).toContain(
      '<table><tr data-header=""><th scope="col">Col 1</th></tr>' +
        "<tr><td>val 1</td></tr></table>",
    );
  });
});
